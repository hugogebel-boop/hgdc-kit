import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type GenericDatabaseWriter,
  type SchemaDefinition,
} from "convex/server"
import { ConvexError, v, type GenericId, type Infer } from "convex/values"

import { currentMonth } from "./model.ts"

/*
 * La partie Convex de l'assistant : tables, validateurs et fonctions de base de données, à
 * appeler depuis les fonctions du produit. Le kit ne déclare aucune fonction publique : le
 * produit pose sa garde (`requireOrgMember` de `@hgdc/auth/convex`, ou la sienne) puis passe la
 * personne vérifiée (`Speaker`). Chaque fonction ci-dessous revérifie qu'une conversation, un
 * message ou une action appartient à cette personne dans cette organisation : un identifiant
 * venu du navigateur ou du modèle n'ouvre jamais la conversation d'un collègue.
 */

export const vToolChip = v.object({
  id: v.string(),
  label: v.string(),
  status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
})
export type ToolChip = Infer<typeof vToolChip>

export const vMessageStatus = v.union(
  v.literal("pending"),
  v.literal("streaming"),
  v.literal("done"),
  v.literal("error"),
)

export const vActionStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("cancelled"),
  v.literal("failed"),
)

export const vActionDetail = v.object({ label: v.string(), value: v.string() })
export type ActionDetail = Infer<typeof vActionDetail>

/**
 * Les cinq tables, à étaler dans `defineSchema({ ...assistantTables(), … })`. L'organisation est
 * celle d'Account (identifiant texte), la personne son `subject`.
 */
export function assistantTables() {
  return {
    /** Une conversation, propre à une personne dans une organisation. `history` : messages de l'API Anthropic en JSON. */
    assistantThreads: defineTable({
      organizationId: v.string(),
      userId: v.string(),
      title: v.string(),
      /** Profil de la conversation (« team », « client »…) : consigne et outils ne changent jamais en route. */
      mode: v.optional(v.string()),
      history: v.string(),
      updatedAt: v.number(),
    })
      .index("by_org_user", ["organizationId", "userId", "updatedAt"])
      .index("by_user", ["userId"])
      .index("by_updated", ["updatedAt"]),

    /** Un message affiché : la demande, ou la réponse écrite au fil de l'eau. */
    assistantMessages: defineTable({
      threadId: v.id("assistantThreads"),
      organizationId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant")),
      text: v.string(),
      status: vMessageStatus,
      tools: v.array(vToolChip),
      credits: v.optional(v.number()),
    })
      .index("by_thread", ["threadId"])
      .index("by_status", ["status"]),

    /** Une action proposée par l'assistant, qui n'a lieu qu'au clic « Confirmer ». */
    assistantActions: defineTable({
      threadId: v.id("assistantThreads"),
      organizationId: v.string(),
      messageId: v.id("assistantMessages"),
      tool: v.string(),
      input: v.string(),
      summary: v.string(),
      details: v.array(vActionDetail),
      /** Empreinte de ce que montre la carte : l'action est refusée si le contenu a bougé avant le clic. */
      snapshot: v.optional(v.string()),
      status: vActionStatus,
      result: v.optional(v.string()),
    }).index("by_thread", ["threadId"]),

    /** Crédits consommés par organisation et par mois (1 crédit = 1 centime de dollar de coût modèle). */
    assistantUsage: defineTable({
      organizationId: v.string(),
      month: v.string(),
      credits: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
    }).index("by_org_month", ["organizationId", "month"]),

    /** Clé Anthropic ou OpenRouter de l'organisation, scellée (`@hgdc/assistant/secret`), jamais rendue. */
    assistantKeys: defineTable({
      organizationId: v.string(),
      sealed: v.string(),
      hint: v.string(),
      updatedBy: v.string(),
      updatedAt: v.number(),
    }).index("by_org", ["organizationId"]),
  }
}

export type AssistantTables = ReturnType<typeof assistantTables>
export type AssistantDataModel = DataModelFromSchemaDefinition<SchemaDefinition<AssistantTables, true>>
export type ThreadId = GenericId<"assistantThreads">
export type MessageId = GenericId<"assistantMessages">
export type ActionId = GenericId<"assistantActions">

/** Ce dont les fonctions de lecture ont besoin : le `ctx` d'une query, d'une mutation. */
/**
 * Le `ctx` d'une query (lecture) ou d'une mutation (écriture) du produit. Le type de sa base vient
 * du schéma du produit, qui contient `assistantTables()` ; TypeScript ne sait pas comparer deux
 * modèles de données Convex de tailles différentes, d'où cette forme minimale, relue ici avec le
 * type des tables de l'assistant.
 */
export type AssistantReader = { db: { get: unknown; query: unknown } }
export type AssistantWriter = { db: { get: unknown; query: unknown; insert: unknown; patch: unknown; delete: unknown } }

function db(ctx: AssistantReader): GenericDatabaseWriter<AssistantDataModel> {
  return ctx.db as GenericDatabaseWriter<AssistantDataModel>
}

/** La personne vérifiée par la garde du produit, dans l'organisation de la demande. */
export type Speaker = { organizationId: string; userId: string }

/** Au-delà, une réponse est déclarée interrompue (une action Convex dure 10 minutes au plus). */
export const STUCK_AFTER_MS = 11 * 60_000
export const MAX_TEXT = 4000

export type TurnTexts = {
  empty: string
  tooLong: (max: number) => string
  notConfigured: string
  exhausted: (limit: number) => string
  busy: string
  notFound: string
  alreadyHandled: string
  interrupted: string
}

export const TURN_TEXTS: TurnTexts = {
  empty: "Écris ta demande.",
  tooLong: (max) => `${max} caractères au plus par message.`,
  notConfigured: "L'assistant n'est pas encore branché. Un administrateur peut ajouter la clé dans les réglages.",
  exhausted: (limit) =>
    `Les ${limit} crédits du mois sont utilisés. Le compteur repart le 1er du mois, ou un administrateur peut ajouter la clé de l'organisation dans les réglages.`,
  busy: "L'assistant répond encore. Un instant.",
  notFound: "Introuvable.",
  alreadyHandled: "Cette action a déjà été traitée.",
  interrupted: "La réponse a été interrompue. Réessaie.",
}

/** Le titre d'une conversation : sa première demande, coupée à 60 caractères. */
export function threadTitle(text: string): string {
  const line = text.trim().replace(/\s+/g, " ")
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

// ───────────────────────────── Lecture ─────────────────────────────

export async function ownKey(ctx: AssistantReader, organizationId: string) {
  return await db(ctx)
    .query("assistantKeys")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first()
}

export async function usedCredits(ctx: AssistantReader, organizationId: string, now: number = Date.now()) {
  const row = await db(ctx)
    .query("assistantUsage")
    .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", currentMonth(now)))
    .first()
  return row?.credits ?? 0
}

/**
 * L'état de l'assistant pour l'organisation, au format de `AssistantView` (`@hgdc/ui`).
 * `platformKey` : la clé de la plateforme est posée (`readKey(process.env.…) !== undefined`).
 */
export async function readStatus(
  ctx: AssistantReader,
  organizationId: string,
  options: { limit: number; platformKey: boolean },
) {
  const key = await ownKey(ctx, organizationId)
  return {
    ready: Boolean(key) || options.platformKey,
    ownKey: key ? { hint: key.hint, updatedAt: key.updatedAt } : null,
    credits: { used: await usedCredits(ctx, organizationId), limit: options.limit },
  }
}

/** La conversation, si elle est à cette personne dans cette organisation ; sinon « Introuvable. ». */
export async function ownThread(ctx: AssistantReader, speaker: Speaker, threadId: ThreadId, mode?: string) {
  const thread = await db(ctx).get(threadId)
  if (
    !thread ||
    thread.organizationId !== speaker.organizationId ||
    thread.userId !== speaker.userId ||
    (mode !== undefined && (thread.mode ?? undefined) !== mode)
  )
    throw new ConvexError(TURN_TEXTS.notFound)
  return thread
}

/** Les dernières conversations de la personne, de la plus récente à la plus ancienne. */
export async function listThreads(
  ctx: AssistantReader,
  speaker: Speaker,
  options: { limit?: number; mode?: string } = {},
) {
  const rows = await db(ctx)
    .query("assistantThreads")
    .withIndex("by_org_user", (q) => q.eq("organizationId", speaker.organizationId).eq("userId", speaker.userId))
    .order("desc")
    .take(options.limit ?? 30)
  return rows
    .filter((t) => options.mode === undefined || (t.mode ?? undefined) === options.mode)
    .map((t) => ({ _id: t._id, title: t.title, updatedAt: t.updatedAt }))
}

/** Messages et cartes d'une conversation, sans l'entrée brute des actions. */
export async function readThread(ctx: AssistantReader, speaker: Speaker, threadId: ThreadId, mode?: string) {
  await ownThread(ctx, speaker, threadId, mode)
  const [messages, actions] = await Promise.all([
    db(ctx)
      .query("assistantMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect(),
    db(ctx)
      .query("assistantActions")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect(),
  ])
  return {
    messages: messages.map((m) => ({
      _id: m._id,
      role: m.role,
      text: m.text,
      status: m.status,
      tools: m.tools,
      ...(m.credits === undefined ? {} : { credits: m.credits }),
    })),
    actions: actions.map((a) => ({
      _id: a._id,
      messageId: a.messageId,
      tool: a.tool,
      summary: a.summary,
      details: a.details,
      status: a.status,
      ...(a.result === undefined ? {} : { result: a.result }),
    })),
  }
}

/** Ce que l'action Node relit avant d'appeler le modèle. `null` si la conversation a disparu. */
export async function turnContext(ctx: AssistantReader, args: { threadId: ThreadId; organizationId: string }) {
  const thread = await db(ctx).get(args.threadId)
  if (!thread || thread.organizationId !== args.organizationId) return null
  const key = await ownKey(ctx, args.organizationId)
  return { history: thread.history, mode: thread.mode ?? null, sealedKey: key?.sealed ?? null }
}

// ───────────────────────────── Écriture ─────────────────────────────

/**
 * Une demande : vérifie la longueur, la clé, les crédits, que la conversation est à la personne
 * et qu'aucune réponse n'est en cours, puis écrit la demande et la réponse en attente. Le produit
 * planifie ensuite son action Node avec `threadId`, `messageId` et la personne.
 */
export async function startTurn(
  ctx: AssistantWriter,
  speaker: Speaker,
  args: {
    threadId?: ThreadId | null
    text: string
    limit: number
    platformKey: boolean
    mode?: string
    maxText?: number
    now?: number
    texts?: Partial<TurnTexts>
  },
): Promise<{ threadId: ThreadId; messageId: MessageId; text: string }> {
  const texts = { ...TURN_TEXTS, ...args.texts }
  const now = args.now ?? Date.now()
  const maxText = args.maxText ?? MAX_TEXT
  const text = args.text.trim()
  if (!text) throw new ConvexError(texts.empty)
  if (text.length > maxText) throw new ConvexError(texts.tooLong(maxText))

  const key = await ownKey(ctx, speaker.organizationId)
  if (!key && !args.platformKey) throw new ConvexError(texts.notConfigured)
  if (!key && (await usedCredits(ctx, speaker.organizationId, now)) >= args.limit)
    throw new ConvexError(texts.exhausted(args.limit))

  let threadId = args.threadId ?? null
  if (threadId) {
    await ownThread(ctx, speaker, threadId, args.mode)
    const last = await db(ctx)
      .query("assistantMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId!))
      .order("desc")
      .first()
    const stuck = last && now - last._creationTime > STUCK_AFTER_MS
    if (last && !stuck && (last.status === "pending" || last.status === "streaming")) throw new ConvexError(texts.busy)
    await db(ctx).patch(threadId, { updatedAt: now })
  } else {
    threadId = await db(ctx).insert("assistantThreads", {
      organizationId: speaker.organizationId,
      userId: speaker.userId,
      title: threadTitle(text),
      ...(args.mode === undefined ? {} : { mode: args.mode }),
      history: "[]",
      updatedAt: now,
    })
  }
  await db(ctx).insert("assistantMessages", {
    threadId,
    organizationId: speaker.organizationId,
    role: "user",
    text,
    status: "done",
    tools: [],
  })
  const messageId = await db(ctx).insert("assistantMessages", {
    threadId,
    organizationId: speaker.organizationId,
    role: "assistant",
    text: "",
    status: "pending",
    tools: [],
  })
  return { threadId, messageId, text }
}

/** Champs d'une réponse en cours, pour la mutation interne que l'action Node appelle. */
export const vMessagePatch = {
  text: v.optional(v.string()),
  status: v.optional(v.union(v.literal("streaming"), v.literal("done"), v.literal("error"))),
  tools: v.optional(v.array(vToolChip)),
  credits: v.optional(v.number()),
}

export async function patchMessage(
  ctx: AssistantWriter,
  messageId: MessageId,
  patch: { text?: string; status?: "streaming" | "done" | "error"; tools?: ToolChip[]; credits?: number },
): Promise<void> {
  const message = await db(ctx).get(messageId)
  if (!message || message.role !== "assistant") return
  const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
  await db(ctx).patch(messageId, fields)
}

export const vFinishTurn = {
  threadId: v.id("assistantThreads"),
  organizationId: v.string(),
  history: v.union(v.string(), v.null()),
  credits: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  charge: v.boolean(),
}

/**
 * Fin d'une réponse : l'historique (`null` : inchangé, après un refus ou une erreur) et, avec la
 * clé de la plateforme, les crédits du mois.
 */
export async function finishTurn(
  ctx: AssistantWriter,
  args: {
    threadId: ThreadId
    organizationId: string
    history: string | null
    credits: number
    inputTokens: number
    outputTokens: number
    charge: boolean
    now?: number
  },
): Promise<void> {
  const now = args.now ?? Date.now()
  const thread = await db(ctx).get(args.threadId)
  if (!thread || thread.organizationId !== args.organizationId) return
  await db(ctx).patch(args.threadId, { ...(args.history === null ? {} : { history: args.history }), updatedAt: now })
  if (!args.charge) return
  const month = currentMonth(now)
  const row = await db(ctx)
    .query("assistantUsage")
    .withIndex("by_org_month", (q) => q.eq("organizationId", args.organizationId).eq("month", month))
    .first()
  if (row) {
    await db(ctx).patch(row._id, {
      credits: Math.round((row.credits + args.credits) * 10) / 10,
      inputTokens: row.inputTokens + args.inputTokens,
      outputTokens: row.outputTokens + args.outputTokens,
    })
  } else {
    await db(ctx).insert("assistantUsage", {
      organizationId: args.organizationId,
      month,
      credits: args.credits,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    })
  }
}

/** Une note de l'application dans l'historique : le modèle sait ce qui a été confirmé ou annulé. */
export async function noteInHistory(ctx: AssistantWriter, threadId: ThreadId, note: string): Promise<void> {
  const thread = await db(ctx).get(threadId)
  if (!thread) return
  const history = JSON.parse(thread.history) as Array<{ role: string; content: unknown }>
  history.push({ role: "user", content: `(Note de l'application) ${note}` })
  await db(ctx).patch(threadId, { history: JSON.stringify(history) })
}

/**
 * Enregistre la carte d'un outil `confirm`, après que le produit a vérifié, avec les droits de la
 * personne, que l'action peut avoir lieu. Rien ne s'exécute ici.
 */
export async function proposeAction(
  ctx: AssistantWriter,
  args: {
    threadId: ThreadId
    messageId: MessageId
    organizationId: string
    tool: string
    input: unknown
    summary: string
    details?: ActionDetail[]
    snapshot?: string
  },
): Promise<ActionId> {
  const thread = await db(ctx).get(args.threadId)
  const message = await db(ctx).get(args.messageId)
  if (
    !thread ||
    thread.organizationId !== args.organizationId ||
    !message ||
    message.threadId !== args.threadId ||
    message.role !== "assistant"
  )
    throw new ConvexError(TURN_TEXTS.notFound)
  return await db(ctx).insert("assistantActions", {
    threadId: args.threadId,
    organizationId: args.organizationId,
    messageId: args.messageId,
    tool: args.tool,
    input: JSON.stringify(args.input),
    summary: args.summary,
    details: args.details ?? [],
    ...(args.snapshot === undefined ? {} : { snapshot: args.snapshot }),
    status: "pending",
  })
}

/** L'action telle qu'elle a été proposée, pour l'exécuter. */
export type PendingAction = {
  _id: ActionId
  threadId: ThreadId
  tool: string
  /** L'entrée relue (JSON) : à revalider avec le schéma de l'outil avant usage. */
  input: unknown
  summary: string
  snapshot: string | null
}

async function pendingAction(ctx: AssistantReader, speaker: Speaker, actionId: ActionId, mode?: string) {
  const action = await db(ctx).get(actionId)
  if (!action || action.organizationId !== speaker.organizationId) throw new ConvexError(TURN_TEXTS.notFound)
  await ownThread(ctx, speaker, action.threadId, mode)
  return action
}

/**
 * La confirmation, depuis la mutation publique du produit (garde posée) : relit l'action, vérifie
 * qu'elle est à la personne et en attente, puis appelle `execute`, qui revérifie les droits et
 * l'empreinte et agit. Une `ConvexError` d'`execute` passe la carte en « Échec » avec son texte,
 * sans annuler la note au modèle : `execute` doit donc tout vérifier avant d'écrire.
 */
export async function confirmAction(
  ctx: AssistantWriter,
  speaker: Speaker,
  actionId: ActionId,
  execute: (action: PendingAction) => Promise<string>,
  options: { mode?: string; failure?: string } = {},
): Promise<{ ok: boolean; message: string }> {
  const action = await pendingAction(ctx, speaker, actionId, options.mode)
  if (action.status !== "pending") throw new ConvexError(TURN_TEXTS.alreadyHandled)
  try {
    const message = await execute({
      _id: action._id,
      threadId: action.threadId,
      tool: action.tool,
      input: JSON.parse(action.input) as unknown,
      summary: action.summary,
      snapshot: action.snapshot ?? null,
    })
    await db(ctx).patch(action._id, { status: "confirmed", result: message })
    await noteInHistory(ctx, action.threadId, `La personne a confirmé : ${action.summary}. Résultat : ${message}`)
    return { ok: true, message }
  } catch (error) {
    if (!(error instanceof ConvexError) || typeof error.data !== "string") throw error
    const message = error.data || options.failure || "L'action n'a pas pu se faire."
    await db(ctx).patch(action._id, { status: "failed", result: message })
    await noteInHistory(ctx, action.threadId, `L'action « ${action.summary} » a échoué : ${message}`)
    return { ok: false, message }
  }
}

export async function cancelAction(
  ctx: AssistantWriter,
  speaker: Speaker,
  actionId: ActionId,
  options: { mode?: string } = {},
): Promise<void> {
  const action = await pendingAction(ctx, speaker, actionId, options.mode)
  if (action.status !== "pending") return
  await db(ctx).patch(action._id, { status: "cancelled" })
  await noteInHistory(ctx, action.threadId, `La personne a annulé : ${action.summary}.`)
}

async function eraseThread(ctx: AssistantWriter, threadId: ThreadId): Promise<void> {
  for (const m of await db(ctx)
    .query("assistantMessages")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect())
    await db(ctx).delete(m._id)
  for (const a of await db(ctx)
    .query("assistantActions")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect())
    await db(ctx).delete(a._id)
  await db(ctx).delete(threadId)
}

export async function deleteThread(ctx: AssistantWriter, speaker: Speaker, threadId: ThreadId): Promise<void> {
  await ownThread(ctx, speaker, threadId)
  await eraseThread(ctx, threadId)
}

/** Clé de l'organisation, déjà essayée et scellée par l'action du produit. */
export async function storeKey(
  ctx: AssistantWriter,
  args: { organizationId: string; sealed: string; hint: string; updatedBy: string; now?: number },
): Promise<void> {
  const existing = await ownKey(ctx, args.organizationId)
  const row = {
    organizationId: args.organizationId,
    sealed: args.sealed,
    hint: args.hint,
    updatedBy: args.updatedBy,
    updatedAt: args.now ?? Date.now(),
  }
  if (existing) await db(ctx).patch(existing._id, row)
  else await db(ctx).insert("assistantKeys", row)
}

export async function removeKey(ctx: AssistantWriter, organizationId: string): Promise<void> {
  const key = await ownKey(ctx, organizationId)
  if (key) await db(ctx).delete(key._id)
}

// ───────────────────────────── Entretien (crons) ─────────────────────────────

/** Réponses restées « en cours » au-delà de 11 minutes : déclarées interrompues. Rend le nombre traité. */
export async function failStuckTurns(
  ctx: AssistantWriter,
  options: { now?: number; limit?: number } = {},
): Promise<number> {
  const before = (options.now ?? Date.now()) - STUCK_AFTER_MS
  let count = 0
  for (const status of ["pending", "streaming"] as const) {
    const rows = await db(ctx)
      .query("assistantMessages")
      .withIndex("by_status", (q) => q.eq("status", status).lt("_creationTime", before))
      .take(options.limit ?? 100)
    for (const row of rows) {
      await db(ctx).patch(row._id, { status: "error", text: row.text || TURN_TEXTS.interrupted })
      count++
    }
  }
  return count
}

/** Conversations sans activité depuis `before` (90 jours par défaut chez les produits) : effacées. */
export async function purgeIdleThreads(
  ctx: AssistantWriter,
  options: { before: number; limit?: number },
): Promise<number> {
  const rows = await db(ctx)
    .query("assistantThreads")
    .withIndex("by_updated", (q) => q.lt("updatedAt", options.before))
    .take(options.limit ?? 50)
  for (const row of rows) await eraseThread(ctx, row._id)
  return rows.length
}

/** Effacement d'une personne (nLPD) : toutes ses conversations, dans toutes les organisations. */
export async function eraseUser(
  ctx: AssistantWriter,
  userId: string,
  options: { limit?: number } = {},
): Promise<number> {
  const rows = await db(ctx)
    .query("assistantThreads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(options.limit ?? 50)
  for (const row of rows) await eraseThread(ctx, row._id)
  return rows.length
}

/** Export des données d'une personne (nLPD) : ses conversations, demandes et réponses. */
export async function exportUser(ctx: AssistantReader, userId: string) {
  const threads = await db(ctx)
    .query("assistantThreads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()
  return await Promise.all(
    threads.map(async (t) => ({
      organizationId: t.organizationId,
      title: t.title,
      updatedAt: t.updatedAt,
      messages: (
        await db(ctx)
          .query("assistantMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", t._id))
          .collect()
      ).map((m) => ({ role: m.role, text: m.text, at: m._creationTime })),
    })),
  )
}
