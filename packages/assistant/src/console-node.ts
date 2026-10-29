import type Anthropic from "@anthropic-ai/sdk"
import { makeFunctionReference } from "convex/server"
import type { ActionBuilder, GenericActionCtx, RegisteredAction } from "convex/server"

import { sovereignClient, type ModelChoice } from "./clients.ts"
import { vRunArgs } from "./console.ts"
import { TURN_TEXTS, type Speaker } from "./convex/context.ts"
import type { MessageId, ThreadId, ToolChip } from "./convex/schema.ts"
import { runTurn } from "./node.ts"
import type { ToolSet } from "./tools.ts"
import type { Taint, TrifectaPolicy } from "./trifecta.ts"

/*
 * L'action Node qui joue un tour de l'assistant d'une console, en face de `createConsoleAssistant`
 * (`@hgdc/assistant/console`) : relit le tour, choisit le modèle souverain de la plateforme
 * (Infomaniak ou Bedrock `eu.`), joue la boucle avec les outils du produit, puis solde le tour.
 * À exporter depuis un fichier `"use node"` du produit :
 *
 *   export const run = createConsoleRunner({ internalAction, tools: TOOLS, system: SYSTEM })
 */

export type ConsoleRunnerConfig<T extends ToolSet> = {
  // oxlint-disable-next-line typescript/no-explicit-any -- le modèle de données est celui du produit.
  internalAction: ActionBuilder<any, "internal">
  tools: T
  /** La consigne du produit, fixe (mise en cache avec les outils). */
  system: string
  /** Le contexte du tour, après le point de cache. Défaut : la date du jour. */
  context?: (speaker: Speaker, now: Date) => string
  /** Module Convex des fonctions de `createConsoleAssistant` : `assistant` (défaut). */
  module?: string
  /** Le modèle. Défaut : `sovereignClient()`. */
  client?: () => Promise<ModelChoice | null>
  /** Texte quand aucun modèle n'est branché. */
  notConfigured?: string
  formal?: boolean
  trifecta?: TrifectaPolicy
  taint?: Partial<Taint>
}

const STOPPED = {
  tools: [] as ToolChip[],
  history: null,
  historyFull: false,
  notesUpTo: 0,
  costMicros: 0,
  costComplete: true,
  inputTokens: 0,
  outputTokens: 0,
}

type RunArgs = { messageId: MessageId; threadId: ThreadId; text: string; speaker: Speaker }

/** La date du jour, au format ISO court. */
export function todayContext(_speaker: Speaker, now: Date): string {
  return `Date : ${now.toISOString().slice(0, 10)}.`
}

/** L'action interne du tour, à exporter sous le nom attendu par `createConsoleAssistant` (`assistantNode:run`). */
export function createConsoleRunner<T extends ToolSet>(
  config: ConsoleRunnerConfig<T>,
): RegisteredAction<"internal", RunArgs, Promise<void>> {
  const self = config.module ?? "assistant"
  const ref = <K extends "query" | "mutation">(name: string) => makeFunctionReference<K>(`${self}:${name}`)
  const refs = {
    context: ref<"query">("context"),
    progress: ref<"mutation">("progress"),
    finish: ref<"mutation">("finish"),
    runRead: ref<"query">("runRead"),
    runWrite: ref<"mutation">("runWrite"),
    runPropose: ref<"mutation">("runPropose"),
  }
  const pickClient = config.client ?? (() => sovereignClient())
  const describe = config.context ?? todayContext

  return config.internalAction({
    args: vRunArgs,
    // oxlint-disable-next-line typescript/no-explicit-any
    handler: async (ctx: GenericActionCtx<any>, args: RunArgs): Promise<void> => {
      const { messageId, threadId, text, speaker } = args
      const { organizationId } = speaker
      const stop = async (message: string): Promise<void> => {
        await ctx.runMutation(refs.finish, { messageId, organizationId, status: "error", text: message, ...STOPPED })
      }
      // `null` : tour déjà soldé, ou lancé sur une clé propre que la console n'accepte pas.
      const turn = (await ctx.runQuery(refs.context, { messageId, organizationId })) as {
        history: string
        notes: string[]
        notesUpTo: number
        maxCostMicros: number | null
      } | null
      if (!turn) return await stop(TURN_TEXTS.interrupted)
      const choice = await pickClient()
      if (!choice) return await stop(config.notConfigured ?? "L'assistant n'est pas encore branché.")
      const call = (name: string, input: Record<string, unknown>) => ({ speaker, threadId, messageId, name, input })
      const result = await runTurn({
        client: choice.client,
        model: choice.model,
        direct: choice.direct,
        price: choice.price,
        system: config.system,
        context: describe(speaker, new Date()),
        tools: config.tools,
        history: JSON.parse(turn.history) as Anthropic.MessageParam[],
        notes: turn.notes,
        text,
        // La réservation du tour en est le plafond : la boucle s'arrête avant de la dépasser.
        maxCostMicros: turn.maxCostMicros,
        ...(config.formal === undefined ? {} : { formal: config.formal }),
        ...(config.trifecta === undefined ? {} : { trifecta: config.trifecta }),
        ...(config.taint === undefined ? {} : { taint: config.taint }),
        handlers: {
          read: async (c) => (await ctx.runQuery(refs.runRead, { speaker, name: c.name, input: c.input })) as string,
          write: async (c) => (await ctx.runMutation(refs.runWrite, call(c.name, c.input))) as string,
          propose: async (c) =>
            (await ctx.runMutation(refs.runPropose, {
              ...call(c.name, c.input),
              ...(c.trifecta ? { trifecta: true } : {}),
            })) as string,
        },
        onProgress: async ({ text: partial, tools }) => {
          await ctx.runMutation(refs.progress, { messageId, organizationId, text: partial, tools })
        },
      })
      // La nature d'une panne seulement : jamais l'erreur brute du fournisseur ni le texte de la conversation.
      if (result.failure) console.warn("Assistant en échec", JSON.stringify({ failure: result.failure }))
      await ctx.runMutation(refs.finish, {
        messageId,
        organizationId,
        status: result.status,
        text: result.text,
        tools: result.tools,
        history: result.history,
        historyFull: result.historyFull,
        notesUpTo: turn.notesUpTo,
        costMicros: result.costMicros,
        // Une étape perdue (rejouée, coupée) : le débit vaut au moins la réservation.
        costComplete: result.costComplete,
        inputTokens: result.usage.input + result.usage.cacheRead + result.usage.cacheWrite,
        outputTokens: result.usage.output,
      })
    },
  }) as unknown as RegisteredAction<"internal", RunArgs, Promise<void>>
}
