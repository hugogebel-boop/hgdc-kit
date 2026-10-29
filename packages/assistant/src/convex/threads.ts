import { ConvexError, v } from "convex/values"

import { currentMonth, microsFromCredits } from "../model.ts"
import { neutralizeMarkup } from "../tools.ts"
import {
  db,
  inFlight,
  MAX_TEXT,
  RESERVE_MICROS,
  TURN_TEXTS,
  type AssistantReader,
  type AssistantWriter,
  type Speaker,
  type TurnTexts,
} from "./context.ts"
import { adjustUsage, settleMessage, spentMicros } from "./credits.ts"
import { ownKey } from "./keys.ts"
import { vToolChip, type MessageId, type ThreadId, type ToolChip } from "./schema.ts"

/*
 * Conversations et tours. Chaque fonction revérifie qu'une conversation ou un message appartient à
 * la personne dans cette organisation : un identifiant venu du navigateur ou du modèle n'ouvre
 * jamais la conversation d'un collègue.
 */

const MAX_NOTES = 20
const MAX_NOTE = 300

/** Le titre d'une conversation : sa première demande, coupée à 60 caractères. */
export function threadTitle(text: string): string {
  const line = text.trim().replace(/\s+/g, " ")
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
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

/**
 * Une demande : vérifie la longueur, la clé, les crédits (réservation dans la même transaction),
 * que la conversation est à la personne, pas pleine, et qu'aucune réponse n'y est en cours, puis
 * écrit la demande et la réponse en attente. Le produit planifie ensuite son action Node avec
 * `messageId` et la personne. `ownKeys: false` ignore une clé propre encore enregistrée : le tour
 * est alors toujours réservé sur le modèle de la plateforme.
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
    ownKeys?: boolean
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

  const key = args.ownKeys === false ? null : await ownKey(ctx, speaker.organizationId)
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

/** Efface une conversation ; un tour non soldé est d'abord débité de sa réservation. Interne au kit. */
export async function eraseThread(ctx: AssistantWriter, threadId: ThreadId): Promise<void> {
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
