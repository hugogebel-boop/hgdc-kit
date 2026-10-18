import Anthropic from "@anthropic-ai/sdk"
import { ConvexError } from "convex/values"

import {
  addUsage,
  creditsFromCost,
  HAIKU_5_5,
  keyProvider,
  NO_USAGE,
  OPENROUTER_BASE_URL,
  requestCost,
} from "./model.ts"
import type { Model, Price, Usage } from "./model.ts"
import { parseToolCall, toolDefinitions, toolLabel } from "./tools.ts"
import type { ToolKind, ToolSet } from "./tools.ts"

/*
 * La boucle de l'assistant, pour une action Node (`"use node"`) : Claude en flux avec le SDK
 * officiel d'Anthropic, chez Anthropic ou par OpenRouter selon la clé, outils vérifiés avant
 * exécution, texte et pastilles poussés au fil de l'eau, coût compté par requête. Le kit ne
 * touche pas la base : le produit passe `execute` (ses fonctions internes, avec la personne déjà
 * vérifiée par la mutation qui a planifié l'action) et `onProgress` (sa mutation `patchMessage`).
 */

/** Ce que la boucle utilise du client : `Anthropic` le fournit, un test peut le simuler. */
export type ModelStream = {
  on(event: "text", listener: (delta: string) => void): unknown
  finalMessage(): Promise<Anthropic.Message>
}
export type ModelClient = { messages: { stream(params: Anthropic.MessageStreamParams): ModelStream } }

export type ClientChoice = { client: Anthropic; model: string; direct: boolean }

/**
 * Le client selon la clé : Anthropic directement, ou OpenRouter qui sert le même modèle avec
 * l'API au format Anthropic (jeton en `Authorization: Bearer`). `origin` et `title` identifient le
 * produit chez OpenRouter.
 */
export function clientFor(key: string, options: { origin: string; title: string; model?: Model }): ClientChoice {
  const model = options.model ?? HAIKU_5_5
  if (keyProvider(key) === "openrouter") {
    return {
      client: new Anthropic({
        baseURL: OPENROUTER_BASE_URL,
        apiKey: null,
        authToken: key,
        defaultHeaders: { "HTTP-Referer": options.origin, "X-Title": options.title },
      }),
      model: model.openrouter,
      direct: false,
    }
  }
  return { client: new Anthropic({ apiKey: key }), model: model.anthropic, direct: true }
}

/** Le texte d'une erreur du modèle pour la personne. `formal` : vouvoiement. */
export function friendlyError(error: unknown, options: { formal?: boolean } = {}): string {
  const retry = options.formal ? "Réessayez" : "Réessaie"
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return options.formal
      ? "L'assistant n'est pas disponible pour l'instant. Réessayez plus tard."
      : "La clé de l'assistant est refusée. Un administrateur peut la vérifier dans les réglages."
  if (error instanceof Anthropic.RateLimitError) return `Trop de demandes en même temps. ${retry} dans une minute.`
  if (error instanceof Anthropic.APIError)
    return `Le service de l'assistant ne répond pas pour l'instant. ${retry} dans un instant.`
  return `Je n'ai pas pu terminer. ${retry} dans un instant.`
}

/** Le texte d'un outil en échec pour le modèle : le message d'une `ConvexError`, sinon générique. */
export function toolErrorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data
  return "Erreur inattendue pendant l'exécution de l'outil."
}

/**
 * Essaie une clé avant de l'enregistrer. OpenRouter : `GET /v1/key` ; Anthropic : liste des modèles.
 * Rend le message à montrer en cas de refus, ou `null`.
 */
export async function verifyKey(
  key: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<string | null> {
  const trimmed = key.trim()
  const provider = keyProvider(trimmed)
  if (!provider) return "Colle une clé Anthropic (sk-ant-…) ou OpenRouter (sk-or-…)."
  const unreachable = "Impossible de vérifier la clé pour l'instant. Réessaie dans un instant."
  if (provider === "openrouter") {
    const response = await fetcher(`${OPENROUTER_BASE_URL}/v1/key`, {
      headers: { Authorization: `Bearer ${trimmed}` },
    }).catch(() => null)
    if (!response) return unreachable
    if (response.status === 401 || response.status === 403)
      return "OpenRouter refuse cette clé. Vérifie-la sur openrouter.ai."
    return response.ok ? null : unreachable
  }
  try {
    await new Anthropic({ apiKey: trimmed }).models.list({ limit: 1 })
    return null
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
      return "Anthropic refuse cette clé. Vérifie-la dans la console Anthropic."
    return unreachable
  }
}

export type ToolChipState = { id: string; label: string; status: "running" | "done" | "error" }

export type ToolCall = { id: string; name: string; kind: ToolKind; input: Record<string, unknown> }

export type RunTurnOptions = {
  client: ModelClient
  model: string
  /** Chez Anthropic directement : les entrées d'outils sont diffusées au fil de l'eau. */
  direct: boolean
  price?: Price
  /** La consigne du produit : fixe, mise en cache avec les outils. */
  system: string
  /** Le contexte du tour (organisation, personne, date) : après le point de cache. */
  context?: string
  tools: ToolSet
  /** L'historique de la conversation, au format de l'API. */
  history: Anthropic.MessageParam[]
  /** La demande, contexte de la page compris. */
  text: string
  /** Exécute un outil vérifié ; une `ConvexError` texte revient au modèle comme erreur d'outil. */
  execute: (call: ToolCall) => Promise<string>
  /** Texte et pastilles en cours, au plus toutes les `flushMs`. */
  onProgress: (state: { text: string; tools: ToolChipState[] }) => Promise<void>
  maxSteps?: number
  maxTokens?: number
  effort?: "low" | "medium" | "high"
  flushMs?: number
  /** Taille au-delà de laquelle l'historique n'est plus repris (la réflexion y est liée, on ne l'abrège pas). */
  maxHistory?: number
  formal?: boolean
}

export type TurnResult = {
  status: "done" | "error"
  text: string
  tools: ToolChipState[]
  /** L'historique à enregistrer (JSON), ou `null` pour garder l'ancien (refus, erreur). */
  history: string | null
  usage: Usage
  credits: number
  error?: unknown
}

const ENDINGS = {
  refusal: "Je ne peux pas aider sur cette demande.",
  maxTokens: "La réponse était trop longue. Demande-moi une étape à la fois.",
  maxSteps: "J'ai fait beaucoup d'étapes d'un coup : dis-moi si je continue.",
  tooLong: "Cette conversation est devenue très longue. Ouvre une nouvelle conversation pour continuer.",
}

/**
 * Un tour complet : appels au modèle et aux outils jusqu'à la réponse finale, `maxSteps` au plus.
 * Ne lève jamais : une erreur du modèle donne `status: "error"` et un texte pour la personne.
 */
export async function runTurn(options: RunTurnOptions): Promise<TurnResult> {
  const price = options.price ?? HAIKU_5_5.price
  const maxSteps = options.maxSteps ?? 12
  const flushMs = options.flushMs ?? 300
  const historyText = JSON.stringify(options.history)
  let usage: Usage = NO_USAGE
  let cost = 0
  const chips: ToolChipState[] = []
  let shown = ""

  const result = (status: "done" | "error", text: string, history: string | null, error?: unknown): TurnResult => ({
    status,
    text: text.trim(),
    tools: chips,
    history,
    usage,
    credits: creditsFromCost(cost),
    ...(error === undefined ? {} : { error }),
  })

  if (historyText.length > (options.maxHistory ?? 500_000)) return result("error", ENDINGS.tooLong, null)

  const messages: Anthropic.MessageParam[] = [...options.history, { role: "user", content: options.text }]
  const definitions = toolDefinitions(options.tools)
  const tools: Anthropic.Tool[] = definitions.map((tool, index) => ({
    ...tool,
    ...(options.direct ? { eager_input_streaming: true } : {}),
    // Le préfixe outils + consigne est stable : mis en cache.
    ...(index === definitions.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }))
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: options.system, cache_control: { type: "ephemeral" } },
    ...(options.context ? [{ type: "text" as const, text: options.context }] : []),
  ]

  let lastFlush = 0
  const flush = async (force = false): Promise<void> => {
    if (!force && Date.now() - lastFlush < flushMs) return
    lastFlush = Date.now()
    await options.onProgress({ text: shown, tools: chips.map((c) => ({ ...c })) })
  }

  let jsonRetries = 0
  try {
    for (let step = 0; step < maxSteps; step++) {
      const stream = options.client.messages.stream({
        model: options.model,
        max_tokens: options.maxTokens ?? 16_000,
        thinking: { type: "adaptive" },
        output_config: { effort: options.effort ?? "medium" },
        system,
        ...(tools.length ? { tools } : {}),
        messages,
      })
      if (shown && !shown.endsWith("\n")) shown += "\n\n"
      stream.on("text", (delta) => {
        shown += delta
        void flush()
      })

      let message: Anthropic.Message
      try {
        message = await stream.finalMessage()
        jsonRetries = 0
      } catch (error) {
        // Une entrée d'outil illisible (JSON coupé) : on rejoue le tour, deux fois au plus.
        if (error instanceof Anthropic.APIError || jsonRetries++ >= 2) throw error
        continue
      }
      const stepUsage: Usage = {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
      }
      usage = addUsage(usage, stepUsage)
      cost += requestCost(stepUsage, price)

      // Un refus n'entre pas dans l'historique.
      if (message.stop_reason === "refusal") return result("done", `${shown}\n\n${ENDINGS.refusal}`, null)
      if (message.stop_reason === "max_tokens")
        return result("done", `${shown}\n\n${ENDINGS.maxTokens}`, JSON.stringify(messages))
      messages.push({ role: "assistant", content: message.content })
      if (message.stop_reason === "pause_turn") continue

      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      if (calls.length === 0) return result("done", shown, JSON.stringify(messages))

      for (const call of calls)
        chips.push({ id: call.id, label: toolLabel(options.tools, call.name), status: "running" })
      await flush(true)
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const call of calls) {
        const parsed = parseToolCall(options.tools, call.name, call.input)
        let outcome: Anthropic.ToolResultBlockParam
        if (!parsed.ok) {
          outcome = { type: "tool_result", tool_use_id: call.id, is_error: true, content: parsed.message }
        } else {
          try {
            const content = await options.execute({
              id: call.id,
              name: parsed.name,
              kind: parsed.kind,
              input: parsed.input,
            })
            outcome = { type: "tool_result", tool_use_id: call.id, content }
          } catch (error) {
            outcome = { type: "tool_result", tool_use_id: call.id, is_error: true, content: toolErrorText(error) }
          }
        }
        results.push(outcome)
        const chip = chips.find((c) => c.id === call.id)
        if (chip) chip.status = outcome.is_error ? "error" : "done"
      }
      // Tous les résultats d'un tour dans un seul message : le modèle garde ses appels en parallèle.
      messages.push({ role: "user", content: results })
      await flush(true)
    }
    return result("done", `${shown}\n\n${ENDINGS.maxSteps}`, JSON.stringify(messages))
  } catch (error) {
    const friendly = friendlyError(error, { formal: options.formal ?? false })
    return result("error", shown ? `${shown}\n\n${friendly}` : friendly, null, error)
  }
}
