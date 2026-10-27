import Anthropic from "@anthropic-ai/sdk"

import type { ModelClient, ModelStream } from "./node.ts"

/*
 * Un fournisseur au format OpenAI (`/chat/completions`, Infomaniak AI Services) derrière l'interface
 * que la boucle `runTurn` attend du SDK d'Anthropic (`messages.stream`, `on("text")`,
 * `finalMessage()`). La requête Anthropic est traduite, la réponse en flux est relue et rendue comme
 * un `Anthropic.Message` : la boucle, les outils, les plafonds et l'historique restent les mêmes
 * quel que soit le fournisseur. Les traductions sont des fonctions pures, testées à part.
 */

type OpenAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } }

export type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

export type OpenAIRequest = {
  model: string
  messages: OpenAIMessage[]
  max_tokens: number
  stream: true
  stream_options: { include_usage: true }
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>
  temperature?: number
}

/** Le texte d'un contenu Anthropic (chaîne ou blocs), sans les blocs qui ne sont pas du texte. */
function plainText(content: string | ReadonlyArray<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n")
}

/**
 * La requête Anthropic au format OpenAI. La consigne devient le message `system` ; un résultat
 * d'outil devient un message `tool` ; la réflexion, le cache et l'effort (propres à Claude) tombent.
 */
export function toOpenAIRequest(
  params: Anthropic.MessageStreamParams,
  options: { temperature?: number } = {},
): OpenAIRequest {
  const messages: OpenAIMessage[] = []
  const system = params.system === undefined ? "" : plainText(params.system)
  if (system) messages.push({ role: "system", content: system })

  for (const message of params.messages) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content })
      continue
    }
    if (message.role === "assistant") {
      const text = plainText(message.content as ReadonlyArray<{ type: string; text?: string }>)
      const calls = message.content
        .filter((block): block is Anthropic.ToolUseBlockParam => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          type: "function" as const,
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        }))
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) })
      continue
    }
    // Les résultats d'outils d'abord, dans l'ordre des appels, puis le texte de la personne.
    for (const block of message.content) {
      if (block.type !== "tool_result") continue
      const raw =
        block.content === undefined ? "" : plainText(block.content as ReadonlyArray<{ type: string; text?: string }>)
      messages.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: block.is_error ? `Erreur : ${raw}` : raw,
      })
    }
    const text = plainText(message.content as ReadonlyArray<{ type: string; text?: string }>)
    if (text) messages.push({ role: "user", content: text })
  }

  const tools = (params.tools ?? [])
    .filter((tool): tool is Anthropic.Tool => "input_schema" in tool)
    .map((tool) => ({
      type: "function" as const,
      function: { name: tool.name, description: tool.description ?? "", parameters: tool.input_schema },
    }))

  return {
    model: params.model,
    messages,
    max_tokens: params.max_tokens,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools.length ? { tools } : {}),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
  }
}

/** Ce qui s'accumule pendant le flux. */
export type StreamState = {
  id: string
  model: string
  text: string
  calls: Map<number, { id: string; name: string; arguments: string }>
  finish: string | null
  usage: { input: number; output: number }
}

export function emptyState(model: string): StreamState {
  return { id: "", model, text: "", calls: new Map(), finish: null, usage: { input: 0, output: 0 } }
}

type Chunk = {
  id?: string
  model?: string
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

/** Applique un morceau du flux ; rend le texte nouveau à montrer (`""` sinon). */
export function applyChunk(state: StreamState, chunk: Chunk): string {
  if (chunk.id && !state.id) state.id = chunk.id
  if (chunk.model) state.model = chunk.model
  if (chunk.usage) {
    state.usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 }
  }
  let delta = ""
  for (const choice of chunk.choices ?? []) {
    if (choice.finish_reason) state.finish = choice.finish_reason
    const content = choice.delta?.content
    if (content) delta += content
    for (const call of choice.delta?.tool_calls ?? []) {
      const index = call.index ?? state.calls.size
      const current = state.calls.get(index) ?? { id: "", name: "", arguments: "" }
      if (call.id) current.id = call.id
      if (call.function?.name) current.name += call.function.name
      if (call.function?.arguments) current.arguments += call.function.arguments
      state.calls.set(index, current)
    }
  }
  state.text += delta
  return delta
}

/** Un appel d'outil dont les paramètres ne sont pas du JSON : l'étape se rejoue (`runTurn`). */
export class MalformedToolCallError extends Error {
  constructor(name: string) {
    super(`Paramètres illisibles pour l'outil ${name}.`)
  }
}

const STOP_REASONS: Readonly<Record<string, Anthropic.StopReason>> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  function_call: "tool_use",
  length: "max_tokens",
  content_filter: "refusal",
}

/** Le message final au format Anthropic : texte, puis appels d'outils dans l'ordre. */
export function toAnthropicMessage(state: StreamState): Anthropic.Message {
  const content: Array<Anthropic.TextBlock | Anthropic.ToolUseBlock> = []
  if (state.text) content.push({ type: "text", text: state.text, citations: null } as Anthropic.TextBlock)
  const calls = [...state.calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call)
  for (const [index, call] of calls.entries()) {
    let input: unknown = {}
    if (call.arguments.trim()) {
      try {
        input = JSON.parse(call.arguments)
      } catch {
        throw new MalformedToolCallError(call.name)
      }
    }
    content.push({
      type: "tool_use",
      id: call.id || `call_${index}`,
      name: call.name,
      input,
    } as Anthropic.ToolUseBlock)
  }
  const stop = calls.length ? "tool_use" : (STOP_REASONS[state.finish ?? "stop"] ?? "end_turn")
  return {
    id: state.id || "openai",
    type: "message",
    role: "assistant",
    model: state.model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: state.usage.input,
      output_tokens: state.usage.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as Anthropic.Message
}

/** Les lignes `data:` d'un flux SSE, morceau par morceau ; `[DONE]` termine. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let newline = buffer.indexOf("\n")
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "")
        buffer = buffer.slice(newline + 1)
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim()
          if (data === "[DONE]") return
          if (data) yield data
        }
        newline = buffer.indexOf("\n")
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

export type OpenAIClientOptions = {
  /** Sans barre finale : `https://api.infomaniak.com/2/ai/<produit>/openai/v1`. */
  baseURL: string
  apiKey: string
  temperature?: number
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/** Un client que `runTurn` accepte, pour un fournisseur au format OpenAI. */
export function openAIClient(options: OpenAIClientOptions): ModelClient {
  const fetcher = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init))
  return {
    messages: {
      stream(params, requestOptions): ModelStream {
        const listeners: Array<(delta: string) => void> = []
        const final = (async (): Promise<Anthropic.Message> => {
          const body = toOpenAIRequest(
            params,
            options.temperature === undefined ? {} : { temperature: options.temperature },
          )
          let response: Response
          try {
            response = await fetcher(`${options.baseURL}/chat/completions`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
              body: JSON.stringify(body),
              ...(requestOptions?.signal ? { signal: requestOptions.signal } : {}),
            })
          } catch (error) {
            if (requestOptions?.signal?.aborted) throw new Anthropic.APIUserAbortError()
            throw new Anthropic.APIConnectionError({ cause: error instanceof Error ? error : undefined })
          }
          if (!response.ok || !response.body) {
            const detail = await response.text().catch(() => "")
            let parsed: object | undefined
            try {
              parsed = JSON.parse(detail) as object
            } catch {
              parsed = undefined
            }
            throw Anthropic.APIError.generate(
              response.status,
              parsed,
              detail.slice(0, 300) || undefined,
              response.headers,
            )
          }
          const state = emptyState(params.model)
          for await (const data of sseData(response.body)) {
            let chunk: Chunk
            try {
              chunk = JSON.parse(data) as Chunk
            } catch {
              continue
            }
            const delta = applyChunk(state, chunk)
            if (delta) for (const listener of listeners) listener(delta)
          }
          return toAnthropicMessage(state)
        })()
        // L'appelant lit `finalMessage()` ; une panne avant ne doit pas rester sans gestionnaire.
        final.catch(() => undefined)
        return {
          on(_event, listener) {
            listeners.push(listener)
            return this
          },
          finalMessage: () => final,
        }
      },
    },
  }
}
