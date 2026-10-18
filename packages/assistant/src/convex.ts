import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  type SchemaDefinition,
  type StorageReader,
} from "convex/server"
import { ConvexError, v, type GenericId, type Infer } from "convex/values"

import { creditsFromMicros, currentMonth, microsFromCredits } from "./model.ts"
import { awaitingConfirmation, neutralizeMarkup, parseToolCall, snapshotHash, toolResult } from "./tools.ts"
import type { ToolInputOf, ToolKind, ToolNamesOf, ToolSet } from "./tools.ts"

/*
 * La partie Convex de l'assistant : tables, validateurs et fonctions de base de données, à
 * appeler depuis les fonctions du produit. Le kit ne déclare aucune fonction publique : le
 * produit pose sa garde (`requireOrgMember` de `@hgdc/auth/convex`, ou la sienne) puis passe la
 * personne vérifiée (`Speaker`). Chaque fonction ci-dessous revérifie qu'une conversation, un
 * message ou une action appartient à cette personne dans cette organisation : un identifiant
 * venu du navigateur ou du modèle n'ouvre jamais la conversation d'un collègue.
 *
 * Crédits : une réservation au début du tour (dans la même transaction que le contrôle), ajustée
 * au coût réel à la fin, en micro-dollars entiers. Une réponse qui n'aboutit jamais (délai, panne)
 * garde sa réservation comme coût. Le débit passe par le message, pas par la conversation.
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
      /** L'historique a atteint sa taille maximale : une nouvelle conversation s'impose. */
      full: v.optional(v.boolean()),
      /** Événements de l'application (confirmations, annulations) à remettre au modèle au tour suivant. */
      notes: v.optional(v.array(v.string())),
      /** Numéro du premier événement de `notes` (les plus anciens tombent au-delà de 20). */
      notesBase: v.optional(v.number()),
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
      /** Crédits affichés (dérivés de `costMicros`). */
      credits: v.optional(v.number()),
      /** Réservation posée au début du tour (clé de la plateforme), et son mois. */
      reservedMicros: v.optional(v.number()),
      month: v.optional(v.string()),
      costMicros: v.optional(v.number()),
      /** Le tour est soldé : réservation levée, coût débité. */
      settled: v.optional(v.boolean()),
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
      /** SHA-256 de ce que montre la carte : l'action est refusée si le contenu a bougé avant le clic. */
      snapshot: v.string(),
      expiresAt: v.number(),
      status: vActionStatus,
      result: v.optional(v.string()),
    }).index("by_thread", ["threadId"]),

    /** Consommation par organisation et par mois, en micro-dollars entiers. */
    assistantUsage: defineTable({
      organizationId: v.string(),
      month: v.string(),
      costMicros: v.number(),
      reservedMicros: v.number(),
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
    })
      .index("by_org", ["organizationId"])
      .index("by_updated_by", ["updatedBy"]),
  }
}

export type AssistantTables = ReturnType<typeof assistantTables>
export type AssistantDataModel = DataModelFromSchemaDefinition<SchemaDefinition<AssistantTables, true>>
export type ThreadId = GenericId<"assistantThreads">
export type MessageId = GenericId<"assistantMessages">
export type ActionId = GenericId<"assistantActions">

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

type ReaderDb<D> = D extends GenericDatabaseWriter<infer M> ? GenericDatabaseReader<M> : D

/** Le `ctx` d'une mutation réduit à la lecture : ce que reçoit la description d'une carte. */
export type ReadOnlyCtx<Ctx extends { db: unknown }> = Omit<
  Ctx,
  "db" | "storage" | "scheduler" | "runMutation" | "runAction"
> & {
  db: ReaderDb<Ctx["db"]>
  /** Lecture des fichiers seulement : ni `delete`, ni `generateUploadUrl`, ni `store`. */
  storage: StorageReader
}

/** Une vue en lecture seule du `ctx` : ni écriture en base ou en stockage, ni planificateur, à l'exécution aussi. */
export function readOnly<Ctx extends { db: unknown }>(ctx: Ctx): ReadOnlyCtx<Ctx> {
  const source = ctx.db as GenericDatabaseReader<AssistantDataModel>
  const reader = {
    get: (...args: Parameters<typeof source.get>) => source.get(...args),
    query: (...args: Parameters<typeof source.query>) => source.query(...args),
    normalizeId: (...args: Parameters<typeof source.normalizeId>) => source.normalizeId(...args),
    system: source.system,
  }
  const {
    scheduler: _s,
    runMutation: _m,
    runAction: _a,
    storage,
    ...rest
  } = ctx as Ctx & {
    scheduler?: unknown
    runMutation?: unknown
    runAction?: unknown
    storage?: StorageReader
  }
  const files: StorageReader = {
    getUrl: (...args: Parameters<StorageReader["getUrl"]>) =>
      storage ? storage.getUrl(...args) : Promise.resolve(null),
    getMetadata: (...args: Parameters<StorageReader["getMetadata"]>) =>
      storage ? storage.getMetadata(...args) : Promise.resolve(null),
  }
  return { ...rest, db: reader, storage: files } as unknown as ReadOnlyCtx<Ctx>
}

/** La personne vérifiée par la garde du produit, dans l'organisation de la demande. */
export type Speaker = { organizationId: string; userId: string }

/** Au-delà, une réponse est déclarée interrompue (une action Convex dure 10 minutes au plus). */
export const STUCK_AFTER_MS = 11 * 60_000
export const MAX_TEXT = 4000
/** Réservation par tour avec la clé de la plateforme : 3 crédits. */
export const RESERVE_MICROS = 30_000
/** Durée de vie d'une carte à confirmer. */
export const ACTION_TTL_MS = 24 * 60 * 60_000
const MAX_NOTES = 20
const MAX_NOTE = 300

export type TurnTexts = {
  empty: string
  tooLong: (max: number) => string
  notConfigured: string
  exhausted: (limit: number) => string
  busy: string
  full: string
  notFound: string
  alreadyHandled: string
  interrupted: string
  expired: string
  changed: string
}

export const TURN_TEXTS: TurnTexts = {
  empty: "Écris ta demande.",
  tooLong: (max) => `${max} caractères au plus par message.`,
  notConfigured: "L'assistant n'est pas encore branché. Un administrateur peut ajouter la clé dans les réglages.",
  exhausted: (limit) =>
    `Les ${limit} crédits du mois sont utilisés. Le compteur repart le 1er du mois, ou un administrateur peut ajouter la clé de l'organisation dans les réglages.`,
  busy: "L'assistant répond encore. Un instant.",
  full: "Cette conversation est pleine. Ouvre une nouvelle conversation pour continuer.",
  notFound: "Introuvable.",
  alreadyHandled: "Cette action a déjà été traitée.",
  interrupted: "La réponse a été interrompue. Réessaie.",
  expired: "Cette proposition a expiré. Redemande-la.",
  changed: "Le contenu a changé depuis la proposition. Relis-le, puis redemande l'action.",
}

/** Le titre d'une conversation : sa première demande, coupée à 60 caractères. */
export function threadTitle(text: string): string {
  const line = text.trim().replace(/\s+/g, " ")
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

const inFlight = (m: { status: string; _creationTime: number }, now: number) =>
  (m.status === "pending" || m.status === "streaming") && now - m._creationTime <= STUCK_AFTER_MS

// ───────────────────────────── Crédits ─────────────────────────────

async function usageRow(ctx: AssistantReader, organizationId: string, month: string) {
  return await db(ctx)
    .query("assistantUsage")
    .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", month))
    .first()
}

async function adjustUsage(
  ctx: AssistantWriter,
  organizationId: string,
  month: string,
  delta: { costMicros?: number; reservedMicros?: number; inputTokens?: number; outputTokens?: number },
): Promise<void> {
  const row = await usageRow(ctx, organizationId, month)
  const next = {
    costMicros: (row?.costMicros ?? 0) + (delta.costMicros ?? 0),
    reservedMicros: Math.max(0, (row?.reservedMicros ?? 0) + (delta.reservedMicros ?? 0)),
    inputTokens: (row?.inputTokens ?? 0) + (delta.inputTokens ?? 0),
    outputTokens: (row?.outputTokens ?? 0) + (delta.outputTokens ?? 0),
  }
  if (row) await db(ctx).patch(row._id, next)
  else await db(ctx).insert("assistantUsage", { organizationId, month, ...next })
}

/** Solde un tour : lève la réservation et débite `costMicros` (la réservation entière si inconnu). */
async function settleMessage(
  ctx: AssistantWriter,
  messageId: MessageId,
  cost: { costMicros?: number; costComplete?: boolean; inputTokens?: number; outputTokens?: number } = {},
): Promise<void> {
  const message = await db(ctx).get(messageId)
  if (!message || message.role !== "assistant" || message.settled) return
  const reserved = message.reservedMicros ?? 0
  // Coût inconnu (tour jamais fini) ou partiel (étape rejouée, coupée) : au moins la réservation.
  const charged =
    cost.costMicros === undefined
      ? reserved
      : cost.costComplete === false
        ? Math.max(cost.costMicros, reserved)
        : cost.costMicros
  if (reserved > 0 && message.month) {
    await adjustUsage(ctx, message.organizationId, message.month, {
      reservedMicros: -reserved,
      costMicros: charged,
      inputTokens: cost.inputTokens ?? 0,
      outputTokens: cost.outputTokens ?? 0,
    })
  }
  await db(ctx).patch(messageId, { settled: true, costMicros: charged, credits: creditsFromMicros(charged) })
}

// ───────────────────────────── Lecture ─────────────────────────────

export async function ownKey(ctx: AssistantReader, organizationId: string) {
  return await db(ctx)
    .query("assistantKeys")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first()
}

/** Micro-dollars engagés ce mois (débités et réservés). */
export async function spentMicros(ctx: AssistantReader, organizationId: string, now: number = Date.now()) {
  const row = await usageRow(ctx, organizationId, currentMonth(now))
  return (row?.costMicros ?? 0) + (row?.reservedMicros ?? 0)
}

/**
 * L'état de l'assistant pour l'organisation, au format de `AssistantView` (`@hgdc/ui`). `limit` en
 * crédits ; `platformKey` : la clé de la plateforme est posée (`readKey(process.env.…) !== undefined`).
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
    credits: { used: creditsFromMicros(await spentMicros(ctx, organizationId)), limit: options.limit },
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
  const thread = await ownThread(ctx, speaker, threadId, mode)
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
    full: thread.full ?? false,
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
      expiresAt: a.expiresAt,
      ...(a.result === undefined ? {} : { result: a.result }),
    })),
  }
}

/**
 * Ce que l'action Node relit avant d'appeler le modèle. `null` si le tour n'est plus en cours, ou
 * s'il a été lancé sur la clé de l'organisation et qu'elle a été retirée depuis : un tour sans
 * réservation ne tombe jamais sur la clé de la plateforme. Un tour réservé n'utilise que celle-ci.
 */
export async function turnContext(ctx: AssistantReader, args: { messageId: MessageId; organizationId: string }) {
  const message = await db(ctx).get(args.messageId)
  if (!message || message.organizationId !== args.organizationId || message.settled) return null
  const thread = await db(ctx).get(message.threadId)
  if (!thread) return null
  const charged = (message.reservedMicros ?? 0) > 0
  const key = charged ? null : await ownKey(ctx, args.organizationId)
  if (!charged && !key) return null
  return {
    threadId: thread._id,
    history: thread.history,
    mode: thread.mode ?? null,
    notes: thread.notes ?? [],
    /** À rendre à `finishTurn` : les événements remis jusqu'à ce numéro sont retirés. */
    notesUpTo: (thread.notesBase ?? 0) + (thread.notes ?? []).length,
    /** Clé de l'organisation à ouvrir ; `null` : le tour est réservé, clé de la plateforme. */
    sealedKey: key?.sealed ?? null,
    /** Plafond de coût du tour (`runTurn({ maxCostMicros })`) : la réservation, ou rien avec la clé de l'organisation. */
    maxCostMicros: charged ? (message.reservedMicros ?? 0) : null,
  }
}

// ───────────────────────────── Tour ─────────────────────────────

/**
 * Une demande : vérifie la longueur, la clé, les crédits (réservation dans la même transaction),
 * que la conversation est à la personne, pas pleine, et qu'aucune réponse n'y est en cours, puis
 * écrit la demande et la réponse en attente. Le produit planifie ensuite son action Node avec
 * `messageId` et la personne.
 */
export async function startTurn(
  ctx: AssistantWriter,
  speaker: Speaker,
  args: {
    threadId?: ThreadId | null
    text: string
    /** Crédits par organisation et par mois avec la clé de la plateforme. */
    limit: number
    platformKey: boolean
    mode?: string
    maxText?: number
    reserveMicros?: number
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

  let threadId = args.threadId ?? null
  if (threadId) {
    const thread = await ownThread(ctx, speaker, threadId, args.mode)
    if (thread.full) throw new ConvexError(texts.full)
    const last = await db(ctx)
      .query("assistantMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId!))
      .order("desc")
      .first()
    if (last && inFlight(last, now)) throw new ConvexError(texts.busy)
  }

  const key = await ownKey(ctx, speaker.organizationId)
  const month = currentMonth(now)
  const reserve = args.reserveMicros ?? RESERVE_MICROS
  if (!key) {
    if (!args.platformKey) throw new ConvexError(texts.notConfigured)
    // Contrôle et réservation dans la même transaction : des tours parallèles ne passent pas tous.
    if ((await spentMicros(ctx, speaker.organizationId, now)) + reserve > microsFromCredits(args.limit))
      throw new ConvexError(texts.exhausted(args.limit))
    await adjustUsage(ctx, speaker.organizationId, month, { reservedMicros: reserve })
  }

  if (threadId) {
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
    ...(key ? {} : { reservedMicros: reserve, month }),
  })
  return { threadId, messageId, text }
}

/** Champs de la progression, pour la mutation interne que l'action Node appelle. */
export const vProgress = {
  messageId: v.id("assistantMessages"),
  organizationId: v.string(),
  text: v.string(),
  tools: v.array(vToolChip),
}

/** Texte et pastilles en cours. Refusé (sans erreur) si la réponse est déjà terminée : jamais de recul. */
export async function progressMessage(
  ctx: AssistantWriter,
  args: { messageId: MessageId; organizationId: string; text: string; tools: ToolChip[] },
): Promise<boolean> {
  const message = await db(ctx).get(args.messageId)
  if (
    !message ||
    message.organizationId !== args.organizationId ||
    message.role !== "assistant" ||
    message.settled ||
    (message.status !== "pending" && message.status !== "streaming")
  )
    return false
  await db(ctx).patch(args.messageId, { text: args.text, tools: args.tools, status: "streaming" })
  return true
}

export const vFinishTurn = {
  messageId: v.id("assistantMessages"),
  organizationId: v.string(),
  status: v.union(v.literal("done"), v.literal("error")),
  text: v.string(),
  tools: v.array(vToolChip),
  history: v.union(v.string(), v.null()),
  historyFull: v.boolean(),
  /** `turnContext().notesUpTo` : événements remis au modèle pendant ce tour. */
  notesUpTo: v.number(),
  costMicros: v.number(),
  costComplete: v.boolean(),
  inputTokens: v.number(),
  outputTokens: v.number(),
}

/**
 * Fin d'une réponse, en une transaction : texte final, coût débité (même si la conversation a
 * disparu), historique (`null` : inchangé, après un refus ou une panne). Sans effet si le tour est
 * déjà soldé (balayage des tours interrompus passé avant).
 */
export async function finishTurn(
  ctx: AssistantWriter,
  args: {
    messageId: MessageId
    organizationId: string
    status: "done" | "error"
    text: string
    tools: ToolChip[]
    history: string | null
    historyFull: boolean
    notesUpTo: number
    /** Faux si une étape a échoué ou été coupée : le débit vaut alors au moins la réservation. */
    costComplete?: boolean
    costMicros: number
    inputTokens: number
    outputTokens: number
    now?: number
  },
): Promise<void> {
  const message = await db(ctx).get(args.messageId)
  if (!message || message.organizationId !== args.organizationId || message.role !== "assistant" || message.settled)
    return
  await settleMessage(ctx, args.messageId, args)
  await db(ctx).patch(args.messageId, { status: args.status, text: args.text, tools: args.tools })
  const thread = await db(ctx).get(message.threadId)
  if (!thread) return
  await db(ctx).patch(thread._id, {
    updatedAt: args.now ?? Date.now(),
    ...(args.history === null ? {} : { history: args.history, ...remainingNotes(thread, args.notesUpTo) }),
    ...(args.historyFull ? { full: true } : {}),
  })
}

/** Un événement de l'application pour le prochain tour, hors du texte de l'historique (une ligne, sans balise, 300 caractères). */
export async function noteEvent(ctx: AssistantWriter, threadId: ThreadId, note: string): Promise<void> {
  const thread = await db(ctx).get(threadId)
  if (!thread) return
  // Une ligne, sans balise, bornée : un nom piégé ne forge ni ligne ni bloc d'événements.
  const line = neutralizeMarkup(note.replace(/\s+/g, " ").trim()).slice(0, MAX_NOTE)
  const notes = [...(thread.notes ?? []), line]
  const dropped = Math.max(0, notes.length - MAX_NOTES)
  await db(ctx).patch(threadId, { notes: notes.slice(dropped), notesBase: (thread.notesBase ?? 0) + dropped })
}

/** Les événements encore à remettre après un tour qui a remis ceux d'avant `notesUpTo`. */
function remainingNotes(thread: { notes?: string[]; notesBase?: number }, notesUpTo: number) {
  const base = thread.notesBase ?? 0
  const notes = thread.notes ?? []
  const delivered = Math.min(notes.length, Math.max(0, notesUpTo - base))
  return { notes: notes.slice(delivered), notesBase: base + delivered }
}

// ───────────────────────────── Outils ─────────────────────────────

/** Ce que décrit une carte ; `snapshot` : tout ce qu'elle montre, empreinté et comparé au clic. */
export type Card = { summary: string; details?: ActionDetail[]; snapshot: unknown }

export type ReadHandlers<T extends ToolSet, Ctx> = {
  [N in ToolNamesOf<T, "read">]: (ctx: Ctx, input: ToolInputOf<T, N>, speaker: Speaker) => Promise<unknown>
}

export type WriteHandlers<T extends ToolSet, Ctx> = {
  [N in ToolNamesOf<T, "write">]: (ctx: Ctx, input: ToolInputOf<T, N>, speaker: Speaker) => Promise<unknown>
}

/** Pour chaque outil `confirm` : la carte (lecture seule) et l'exécution (au clic seulement). */
export type ConfirmHandlers<T extends ToolSet, Ctx extends { db: unknown }> = {
  [N in ToolNamesOf<T, "confirm">]: {
    card: (ctx: ReadOnlyCtx<Ctx>, input: ToolInputOf<T, N>, speaker: Speaker) => Promise<Card>
    execute: (ctx: Ctx, input: ToolInputOf<T, N>, speaker: Speaker) => Promise<string>
  }
}

type ToolCallArgs<T extends ToolSet> = {
  tools: T
  speaker: Speaker
  name: string
  input: unknown
  /** Garder le HTML du résultat (corps d'e-mail à reprendre tel quel) ; sinon toute balise est désarmée. */
  markup?: boolean
}
type TurnCallArgs<T extends ToolSet> = ToolCallArgs<T> & { threadId: ThreadId; messageId: MessageId }

function checkedCall(tools: ToolSet, name: string, input: unknown, kind: ToolKind) {
  const parsed = parseToolCall(tools, name, input)
  if (!parsed.ok) throw new ConvexError(parsed.message)
  if (parsed.kind !== kind) throw new ConvexError(`Outil ${name} : pas un outil « ${kind} ».`)
  return parsed
}

function handlerOf<H>(handlers: object, name: string): H {
  const handler = Object.hasOwn(handlers, name) ? (handlers as Record<string, H | undefined>)[name] : undefined
  if (!handler) throw new ConvexError(`Outil ${name} : aucun gestionnaire.`)
  return handler
}

/** Le tour est-il toujours en cours, dans une conversation de la personne ? */
async function assertTurn(ctx: AssistantReader, speaker: Speaker, threadId: ThreadId, messageId: MessageId) {
  await ownThread(ctx, speaker, threadId)
  const message = await db(ctx).get(messageId)
  if (
    !message ||
    message.threadId !== threadId ||
    message.role !== "assistant" ||
    message.settled ||
    !inFlight(message, Date.now())
  )
    throw new ConvexError(TURN_TEXTS.notFound)
}

/** Un outil de lecture, dans une query du produit. Résultat toujours tronqué. */
export async function runReadTool<T extends ToolSet, Ctx extends AssistantReader>(
  ctx: Ctx,
  args: ToolCallArgs<T>,
  handlers: ReadHandlers<T, Ctx>,
): Promise<string> {
  const call = checkedCall(args.tools, args.name, args.input, "read")
  const handler = handlerOf<(ctx: Ctx, input: unknown, speaker: Speaker) => Promise<unknown>>(handlers, call.name)
  return toolResult(await handler(ctx, call.input, args.speaker), undefined, { markup: args.markup ?? false })
}

/** Un outil d'écriture sans envoi, dans une mutation du produit, pendant un tour en cours. */
export async function runWriteTool<T extends ToolSet, Ctx extends AssistantWriter>(
  ctx: Ctx,
  args: TurnCallArgs<T>,
  handlers: WriteHandlers<T, Ctx>,
): Promise<string> {
  const call = checkedCall(args.tools, args.name, args.input, "write")
  await assertTurn(ctx, args.speaker, args.threadId, args.messageId)
  const handler = handlerOf<(ctx: Ctx, input: unknown, speaker: Speaker) => Promise<unknown>>(handlers, call.name)
  return toolResult(await handler(ctx, call.input, args.speaker), undefined, { markup: args.markup ?? false })
}

/**
 * Un outil `confirm` pendant le tour : décrit la carte avec un `ctx` en lecture seule, empreinte
 * ce qu'elle montre, l'enregistre. Rien ne s'exécute ici.
 */
export async function runProposeTool<T extends ToolSet, Ctx extends AssistantWriter>(
  ctx: Ctx,
  args: TurnCallArgs<T> & { now?: number },
  handlers: ConfirmHandlers<T, Ctx>,
): Promise<string> {
  const call = checkedCall(args.tools, args.name, args.input, "confirm")
  await assertTurn(ctx, args.speaker, args.threadId, args.messageId)
  const { card } = handlerOf<{
    card: (ctx: ReadOnlyCtx<Ctx>, input: unknown, speaker: Speaker) => Promise<Card>
  }>(handlers, call.name)
  const described = await card(readOnly(ctx), call.input, args.speaker)
  const actionId = await db(ctx).insert("assistantActions", {
    threadId: args.threadId,
    organizationId: args.speaker.organizationId,
    messageId: args.messageId,
    tool: call.name,
    input: JSON.stringify(call.input),
    summary: described.summary,
    details: described.details ?? [],
    snapshot: await snapshotHash({ tool: call.name, input: call.input, card: described }),
    expiresAt: (args.now ?? Date.now()) + ACTION_TTL_MS,
    status: "pending",
  })
  return awaitingConfirmation(actionId, described.summary)
}

async function pendingAction(ctx: AssistantReader, speaker: Speaker, actionId: ActionId, mode?: string) {
  const action = await db(ctx).get(actionId)
  if (!action || action.organizationId !== speaker.organizationId) throw new ConvexError(TURN_TEXTS.notFound)
  await ownThread(ctx, speaker, action.threadId, mode)
  return action
}

/**
 * La confirmation, depuis la mutation publique du produit (garde posée) : relit l'action, vérifie
 * qu'elle est à la personne, en attente et pas expirée ; redécrit la carte et compare son
 * empreinte ; puis seulement `execute`, avec les droits de la personne qui clique. Une
 * `ConvexError` texte d'`execute` passe la carte en « Échec » : `execute` doit tout vérifier avant
 * d'écrire. Toute autre erreur annule la transaction, et la carte reste à confirmer.
 */
export async function confirmAction<T extends ToolSet, Ctx extends AssistantWriter>(
  ctx: Ctx,
  speaker: Speaker,
  actionId: ActionId,
  options: { tools: T; handlers: ConfirmHandlers<T, Ctx>; mode?: string; now?: number },
): Promise<{ ok: boolean; message: string }> {
  const action = await pendingAction(ctx, speaker, actionId, options.mode)
  if (action.status !== "pending") throw new ConvexError(TURN_TEXTS.alreadyHandled)
  const fail = async (message: string) => {
    await db(ctx).patch(action._id, { status: "failed", result: message })
    await noteEvent(ctx, action.threadId, `L'action « ${action.summary} » n'a pas eu lieu : ${message}`)
    return { ok: false, message }
  }
  if ((options.now ?? Date.now()) > action.expiresAt) return await fail(TURN_TEXTS.expired)

  const call = checkedCall(options.tools, action.tool, JSON.parse(action.input) as unknown, "confirm")
  const handler = handlerOf<{
    card: (ctx: ReadOnlyCtx<Ctx>, input: unknown, speaker: Speaker) => Promise<Card>
    execute: (ctx: Ctx, input: unknown, speaker: Speaker) => Promise<string>
  }>(options.handlers, call.name)
  try {
    const described = await handler.card(readOnly(ctx), call.input, speaker)
    if ((await snapshotHash({ tool: call.name, input: call.input, card: described })) !== action.snapshot)
      return await fail(TURN_TEXTS.changed)
    const message = await handler.execute(ctx, call.input, speaker)
    await db(ctx).patch(action._id, { status: "confirmed", result: message })
    await noteEvent(ctx, action.threadId, `La personne a confirmé : ${action.summary}. Résultat : ${message}`)
    return { ok: true, message }
  } catch (error) {
    if (!(error instanceof ConvexError) || typeof error.data !== "string") throw error
    return await fail(error.data || "L'action n'a pas pu se faire.")
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
  await noteEvent(ctx, action.threadId, `La personne a annulé : ${action.summary}.`)
}

// ───────────────────────────── Effacement, clé, entretien ─────────────────────────────

/** Efface une conversation ; un tour non soldé est d'abord débité de sa réservation. */
async function eraseThread(ctx: AssistantWriter, threadId: ThreadId): Promise<void> {
  for (const m of await db(ctx)
    .query("assistantMessages")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect()) {
    if (m.role === "assistant" && !m.settled) await settleMessage(ctx, m._id)
    await db(ctx).delete(m._id)
  }
  for (const a of await db(ctx)
    .query("assistantActions")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect())
    await db(ctx).delete(a._id)
  await db(ctx).delete(threadId)
}

/** Effacée par la personne : refusé tant qu'une réponse y est en cours. */
export async function deleteThread(
  ctx: AssistantWriter,
  speaker: Speaker,
  threadId: ThreadId,
  options: { now?: number } = {},
): Promise<void> {
  await ownThread(ctx, speaker, threadId)
  const last = await db(ctx)
    .query("assistantMessages")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first()
  if (last && inFlight(last, options.now ?? Date.now())) throw new ConvexError(TURN_TEXTS.busy)
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

/**
 * Réponses restées « en cours » au-delà de 11 minutes (délai de l'action dépassé, `finishTurn`
 * jamais passé) : déclarées interrompues, débitées de leur réservation. Rend le nombre traité.
 */
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
      await settleMessage(ctx, row._id)
      await db(ctx).patch(row._id, { status: "error", text: row.text || TURN_TEXTS.interrupted })
      count++
    }
  }
  return count
}

/** Conversations sans activité depuis `before` (90 jours conseillés) : effacées par lots. */
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

/**
 * Effacement d'une personne (nLPD), par lots : ses conversations dans toutes les organisations,
 * et son identifiant retiré des clés qu'elle a posées. Tant que `done` est faux, le produit
 * replanifie la même mutation.
 */
export async function eraseUser(
  ctx: AssistantWriter,
  userId: string,
  options: { limit?: number } = {},
): Promise<{ erased: number; done: boolean }> {
  const limit = options.limit ?? 25
  const rows = await db(ctx)
    .query("assistantThreads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(limit)
  for (const row of rows) await eraseThread(ctx, row._id)
  for (const key of await db(ctx)
    .query("assistantKeys")
    .withIndex("by_updated_by", (q) => q.eq("updatedBy", userId))
    .collect())
    await db(ctx).patch(key._id, { updatedBy: "personne-effacee" })
  return { erased: rows.length, done: rows.length < limit }
}

/** Export des données d'une personne (nLPD) : conversations, demandes, réponses et cartes. */
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
      actions: (
        await db(ctx)
          .query("assistantActions")
          .withIndex("by_thread", (q) => q.eq("threadId", t._id))
          .collect()
      ).map((a) => ({
        summary: a.summary,
        details: a.details,
        status: a.status,
        result: a.result ?? null,
        at: a._creationTime,
      })),
    })),
  )
}
