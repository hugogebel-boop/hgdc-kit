import { makeFunctionReference } from "convex/server"
import type { GenericDataModel, GenericMutationCtx, RegisteredMutation, RegisteredQuery } from "convex/server"
import { v } from "convex/values"
import type { ObjectType, PropertyValidators, Validator } from "convex/values"

import { cancelAction, confirmAction, runProposeTool, runReadTool, runWriteTool } from "./convex/actions.ts"
import type { ConfirmHandlers, ReadHandlers, WriteHandlers } from "./convex/actions.ts"
import type { AssistantReader, AssistantWriter, Speaker, TurnTexts } from "./convex/context.ts"
import { readStatus } from "./convex/credits.ts"
import { eraseUser, exportUser } from "./convex/privacy.ts"
import { failStuckTurns, PURGE_BATCH, purgeIdleThreads } from "./convex/purge.ts"
import type { ActionId, MessageId, ThreadId, ToolChip } from "./convex/schema.ts"
import {
  deleteThread,
  finishTurn,
  listThreads,
  progressMessage,
  readThread,
  startTurn,
  turnContext,
  vFinishTurn,
  vProgress,
} from "./convex/threads.ts"
import { sovereignReady } from "./providers.ts"
import type { ToolSet } from "./tools.ts"

/*
 * La fabrique de l'assistant d'une console : les fonctions Convex que chaque produit réécrivait à
 * l'identique (status, conversations, envoi, cartes, tours, crons, nLPD, outils du tour). Le
 * produit donne ses constructeurs, sa garde, ses outils et leurs gestionnaires, puis exporte ce
 * qu'il veut :
 *
 *   const assistant = createConsoleAssistant({ builders, guard, tools: TOOLS, read: READ, confirm: CONFIRM })
 *   export const { status, threads, thread, send, confirm, cancel, remove } = assistant.public
 *   export const { context, progress, finish, runRead, runWrite, runPropose, sweep, purge, eraseOf, exportOf } = assistant.internal
 *
 * Toute fonction publique passe d'abord par `guard.speaker` (la garde du produit). L'action Node
 * qui joue le tour vient de `createConsoleRunner` (`@hgdc/assistant/console/node`).
 */

/**
 * Un constructeur du produit (`query`, `mutation`… de `./_generated/server`). Le modèle de données
 * est celui du produit, inconnu du kit : `ctx` et `args` sont relus à l'intérieur.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- voir ci-dessus.
type Loose = any
export type ConsoleBuilder = (definition: {
  args: PropertyValidators
  handler: (ctx: Loose, args: Loose) => Promise<unknown>
}) => unknown

/** Constructeurs du produit (`./_generated/server`). */
export type ConsoleBuilders = {
  query: ConsoleBuilder
  mutation: ConsoleBuilder
  internalQuery: ConsoleBuilder
  internalMutation: ConsoleBuilder
}

/** La garde : ses arguments (ajoutés à chaque fonction publique) et la personne vérifiée. */
export type ConsoleGuard<A extends PropertyValidators, QCtx> = {
  args: A
  speaker: (ctx: QCtx, args: ObjectType<A>) => Promise<Speaker>
}

/** Le contexte de la page ouverte, ajouté à la demande sur une ligne. Son identifiant vient du navigateur : à vérifier. */
export type ConsolePage<P, MCtx> = {
  // oxlint-disable-next-line typescript/no-explicit-any
  args: Validator<P, any, any>
  describe: (ctx: MCtx, speaker: Speaker, page: P) => Promise<string>
}

export type ConsoleAssistantConfig<
  T extends ToolSet,
  A extends PropertyValidators,
  QCtx extends AssistantReader,
  MCtx extends AssistantWriter,
  P,
> = {
  builders: ConsoleBuilders
  guard: ConsoleGuard<A, QCtx>
  tools: T
  read?: ReadHandlers<T, QCtx>
  write?: WriteHandlers<T, MCtx>
  /** Gestionnaires des outils `confirm` et `send`, ou leur fabrique selon la carte confirmée. */
  confirm?: ConfirmHandlers<T, MCtx> | ((actionId: ActionId) => ConfirmHandlers<T, MCtx>)
  page?: ConsolePage<P, MCtx>
  /** Module Convex qui exporte ces fonctions : `assistant` (défaut). */
  module?: string
  /** L'action Node du tour : `assistantNode:run` (défaut). */
  runner?: string
  /** Crédits par organisation et par mois. Défaut : 300. */
  limit?: number
  /** Conversations sans activité effacées après ce nombre de jours. Défaut : 90. */
  idleDays?: number
  texts?: Partial<TurnTexts>
  /** Un modèle est branché. Défaut : `sovereignReady()` (Infomaniak ou Bedrock `eu.`). */
  ready?: () => boolean
  /**
   * Accepter la clé Anthropic propre d'une organisation déjà enregistrée (États-Unis).
   * Défaut : non, chaque tour est réservé sur le modèle de la plateforme.
   */
  ownKeys?: boolean
}

export const CONSOLE_LIMIT = 300
export const CONSOLE_IDLE_DAYS = 90

/** La personne, pour les fonctions internes que l'action Node appelle. */
export const vSpeaker = v.object({ organizationId: v.string(), userId: v.string() })

/** Arguments de l'action Node du tour (`createConsoleRunner`). */
export const vRunArgs = {
  messageId: v.id("assistantMessages"),
  threadId: v.id("assistantThreads"),
  text: v.string(),
  speaker: vSpeaker,
}

/** Un appel d'outil pendant le tour. */
export const vTurnCall = {
  speaker: vSpeaker,
  threadId: v.id("assistantThreads"),
  messageId: v.id("assistantMessages"),
  name: v.string(),
  input: v.any(),
  trifecta: v.optional(v.boolean()),
}

/** La page ouverte, ajoutée à la demande. */
export function withPage(text: string, context: string): string {
  return context ? `${text}\n\n(Page ouverte) ${context}` : text
}

// Les types écrits en entier (pas d'alias) : `ApiFromModules` du produit y relit arguments et résultat.
type Args<T> = T & Record<string, unknown>

type Status = Awaited<ReturnType<typeof readStatus>>
type ThreadView = Awaited<ReturnType<typeof readThread>>
type ThreadRow = Awaited<ReturnType<typeof listThreads>>[number]
type TurnView = Awaited<ReturnType<typeof turnContext>>
type ExportView = Awaited<ReturnType<typeof exportUser>>
type CallArgs = {
  speaker: Speaker
  threadId: ThreadId
  messageId: MessageId
  name: string
  input: unknown
  trifecta?: boolean
}
type ProgressArgs = { messageId: MessageId; organizationId: string; text: string; tools: ToolChip[] }
type FinishArgs = Parameters<typeof finishTurn>[1]

export type ConsoleAssistant<A extends PropertyValidators, P> = {
  public: {
    status: RegisteredQuery<"public", Args<ObjectType<A>>, Promise<Status>>
    threads: RegisteredQuery<"public", Args<ObjectType<A>>, Promise<ThreadRow[]>>
    thread: RegisteredQuery<"public", Args<ObjectType<A> & { threadId: ThreadId }>, Promise<ThreadView>>
    send: RegisteredMutation<
      "public",
      Args<ObjectType<A> & { threadId?: ThreadId; text: string; page?: P }>,
      Promise<ThreadId>
    >
    confirm: RegisteredMutation<
      "public",
      Args<ObjectType<A> & { actionId: ActionId }>,
      Promise<{ ok: boolean; message: string }>
    >
    cancel: RegisteredMutation<"public", Args<ObjectType<A> & { actionId: ActionId }>, Promise<null>>
    remove: RegisteredMutation<"public", Args<ObjectType<A> & { threadId: ThreadId }>, Promise<null>>
  }
  internal: {
    context: RegisteredQuery<"internal", Args<{ messageId: MessageId; organizationId: string }>, Promise<TurnView>>
    progress: RegisteredMutation<"internal", Args<ProgressArgs>, Promise<boolean>>
    finish: RegisteredMutation<"internal", Args<FinishArgs>, Promise<null>>
    runRead: RegisteredQuery<"internal", Args<{ speaker: Speaker; name: string; input: unknown }>, Promise<string>>
    runWrite: RegisteredMutation<"internal", Args<CallArgs>, Promise<string>>
    runPropose: RegisteredMutation<"internal", Args<CallArgs>, Promise<string>>
    sweep: RegisteredMutation<"internal", Args<Record<string, never>>, Promise<number>>
    purge: RegisteredMutation<"internal", Args<Record<string, never>>, Promise<number>>
    eraseOf: RegisteredMutation<"internal", Args<{ userId: string }>, Promise<boolean>>
    exportOf: RegisteredQuery<"internal", Args<{ userId: string }>, Promise<ExportView>>
  }
}

/** Les fonctions de l'assistant d'une console, à exporter par le produit. */
export function createConsoleAssistant<
  T extends ToolSet,
  A extends PropertyValidators,
  QCtx extends AssistantReader,
  MCtx extends AssistantWriter,
  P = never,
>(config: ConsoleAssistantConfig<T, A, QCtx, MCtx, P>): ConsoleAssistant<A, P> {
  const { builders, guard, tools } = config
  const self = config.module ?? "assistant"
  const runner = makeFunctionReference<"action">(config.runner ?? "assistantNode:run")
  const purgeRef = makeFunctionReference<"mutation">(`${self}:purge`)
  const eraseRef = makeFunctionReference<"mutation">(`${self}:eraseOf`)
  const limit = config.limit ?? CONSOLE_LIMIT
  const idleMs = (config.idleDays ?? CONSOLE_IDLE_DAYS) * 86_400_000
  const ready = config.ready ?? (() => sovereignReady())
  const ownKeys = config.ownKeys ?? false
  const confirmHandlers = (actionId: ActionId): ConfirmHandlers<T, MCtx> => {
    const handlers = config.confirm ?? ({} as ConfirmHandlers<T, MCtx>)
    return typeof handlers === "function" ? handlers(actionId) : handlers
  }
  // Les constructeurs ont le modèle de données du produit ; les gestionnaires, son `ctx`.
  const q = (ctx: unknown) => ctx as QCtx
  const m = (ctx: unknown) => ctx as MCtx
  const speakerOf = async (ctx: unknown, args: Record<string, unknown>) =>
    await guard.speaker(q(ctx), args as ObjectType<A>)
  const only = (args: Record<string, unknown>, keys: ReadonlyArray<string>) =>
    Object.fromEntries(Object.entries(args).filter(([key]) => !keys.includes(key))) as ObjectType<A>

  const status = builders.query({
    args: guard.args,
    handler: async (ctx, args) => {
      const speaker = await speakerOf(ctx, args)
      return await readStatus(q(ctx), speaker.organizationId, { limit, platformKey: ready(), ownKeys })
    },
  })

  const threads = builders.query({
    args: guard.args,
    handler: async (ctx, args) => await listThreads(q(ctx), await speakerOf(ctx, args)),
  })

  const thread = builders.query({
    args: { ...guard.args, threadId: v.id("assistantThreads") },
    handler: async (ctx, args) => {
      const { threadId, ...rest } = args as { threadId: ThreadId }
      return await readThread(q(ctx), await speakerOf(ctx, rest), threadId)
    },
  })

  const send = builders.mutation({
    args: {
      ...guard.args,
      threadId: v.optional(v.id("assistantThreads")),
      text: v.string(),
      ...(config.page ? { page: v.optional(config.page.args) } : {}),
    },
    handler: async (ctx: GenericMutationCtx<GenericDataModel>, args: Record<string, unknown>) => {
      const speaker = await speakerOf(ctx, only(args, ["threadId", "text", "page"]))
      // Contrôle des crédits et réservation dans la même transaction.
      const turn = await startTurn(m(ctx), speaker, {
        threadId: (args.threadId as ThreadId | undefined) ?? null,
        text: args.text as string,
        limit,
        platformKey: ready(),
        ownKeys,
        ...(config.texts ? { texts: config.texts } : {}),
      })
      const page = args.page as P | undefined
      const context =
        config.page && page !== undefined ? await config.page.describe(m(ctx), speaker, page).catch(() => "") : ""
      await ctx.scheduler.runAfter(0, runner, {
        messageId: turn.messageId,
        threadId: turn.threadId,
        text: withPage(turn.text, context),
        speaker,
      })
      return turn.threadId
    },
  })

  /** Le clic « Confirmer » : l'action a lieu ici, avec la session et les droits de la personne qui clique. */
  const confirm = builders.mutation({
    args: { ...guard.args, actionId: v.id("assistantActions") },
    handler: async (ctx, args) => {
      const { actionId, ...rest } = args as { actionId: ActionId }
      return await confirmAction(m(ctx), await speakerOf(ctx, rest), actionId, {
        tools,
        handlers: confirmHandlers(actionId),
      })
    },
  })

  const cancel = builders.mutation({
    args: { ...guard.args, actionId: v.id("assistantActions") },
    handler: async (ctx, args) => {
      const { actionId, ...rest } = args as { actionId: ActionId }
      await cancelAction(m(ctx), await speakerOf(ctx, rest), actionId)
      return null
    },
  })

  /** Refusé tant qu'une réponse est en cours. */
  const remove = builders.mutation({
    args: { ...guard.args, threadId: v.id("assistantThreads") },
    handler: async (ctx, args) => {
      const { threadId, ...rest } = args as { threadId: ThreadId }
      await deleteThread(m(ctx), await speakerOf(ctx, rest), threadId)
      return null
    },
  })

  const context = builders.internalQuery({
    args: { messageId: v.id("assistantMessages"), organizationId: v.string() },
    handler: async (ctx, args) => {
      const turn = await turnContext(q(ctx), args as { messageId: MessageId; organizationId: string })
      // Sans clés propres, un tour non réservé ne se joue pas (jamais sur la plateforme sans réservation).
      return turn && (ownKeys || turn.sealedKey === null) ? turn : null
    },
  })

  const progress = builders.internalMutation({
    args: vProgress,
    handler: async (ctx, args) => await progressMessage(m(ctx), args as ProgressArgs),
  })

  const finish = builders.internalMutation({
    args: vFinishTurn,
    handler: async (ctx, args) => {
      await finishTurn(m(ctx), args as FinishArgs)
      return null
    },
  })

  const runRead = builders.internalQuery({
    args: { speaker: vSpeaker, name: v.string(), input: v.any() },
    handler: async (ctx, args) => {
      const { speaker, name, input } = args as { speaker: Speaker; name: string; input: unknown }
      return await runReadTool(q(ctx), { tools, speaker, name, input }, config.read ?? ({} as ReadHandlers<T, QCtx>))
    },
  })

  const runWrite = builders.internalMutation({
    args: vTurnCall,
    handler: async (ctx, args) => {
      const { trifecta: _t, ...call } = args as CallArgs
      return await runWriteTool(m(ctx), { tools, ...call }, config.write ?? ({} as WriteHandlers<T, MCtx>))
    },
  })

  const runPropose = builders.internalMutation({
    args: vTurnCall,
    handler: async (ctx, args) => {
      const { trifecta, ...call } = args as CallArgs
      return await runProposeTool(
        m(ctx),
        { tools, ...call, ...(trifecta ? { trifecta } : {}) },
        // L'identifiant de la carte n'existe pas encore : une fabrique reçoit un identifiant vide.
        confirmHandlers("" as ActionId),
      )
    },
  })

  const sweep = builders.internalMutation({ args: {}, handler: async (ctx) => await failStuckTurns(m(ctx)) })

  /** Un lot plein se replanifie jusqu'à épuisement. */
  const purge = builders.internalMutation({
    args: {},
    handler: async (ctx: GenericMutationCtx<GenericDataModel>) => {
      const erased = await purgeIdleThreads(m(ctx), { before: Date.now() - idleMs })
      if (erased === PURGE_BATCH) await ctx.scheduler.runAfter(0, purgeRef, {})
      return erased
    },
  })

  /** Effacement d'une personne (nLPD), par lots replanifiés jusqu'au bout. */
  const eraseOf = builders.internalMutation({
    args: { userId: v.string() },
    handler: async (ctx: GenericMutationCtx<GenericDataModel>, args: Record<string, unknown>) => {
      const userId = args.userId as string
      const { done } = await eraseUser(m(ctx), userId)
      if (!done) await ctx.scheduler.runAfter(0, eraseRef, { userId })
      return done
    },
  })

  /** Export d'une personne (nLPD) : conversations, demandes, réponses et cartes. */
  const exportOf = builders.internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => await exportUser(q(ctx), (args as { userId: string }).userId),
  })

  return {
    public: { status, threads, thread, send, confirm, cancel, remove },
    internal: { context, progress, finish, runRead, runWrite, runPropose, sweep, purge, eraseOf, exportOf },
  } as unknown as ConsoleAssistant<A, P>
}
