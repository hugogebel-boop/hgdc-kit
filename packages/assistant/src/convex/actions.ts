import { ConvexError } from "convex/values"

import { awaitingConfirmation, parseToolCall, snapshotHash, toolResult } from "../tools.ts"
import type { ToolInputOf, ToolKind, ToolNamesOf, ToolSet } from "../tools.ts"
import {
  ACTION_TTL_MS,
  db,
  inFlight,
  readOnly,
  TURN_TEXTS,
  type AssistantReader,
  type AssistantWriter,
  type ReadOnlyCtx,
  type Speaker,
} from "./context.ts"
import type { ActionDetail, ActionId, MessageId, ThreadId } from "./schema.ts"
import { noteEvent, ownThread } from "./threads.ts"

/*
 * Les outils pendant le tour et les cartes à confirmer. La classe d'un outil décide de son chemin :
 * `read` dans une query, `write` dans une mutation, `confirm` et `send` deviennent une carte que la
 * personne confirme ; l'action n'a lieu qu'au clic, dans sa mutation publique.
 */

/** Ce que décrit une carte ; `snapshot` : tout ce qu'elle montre, empreinté et comparé au clic. */
export type Card = { summary: string; details?: ActionDetail[]; snapshot: unknown }

/** Les classes qui passent par une carte. */
export type CardKind = "confirm" | "send"

export type ReadHandlers<T extends ToolSet, Ctx> = {
  [N in ToolNamesOf<T, "read">]: (ctx: Ctx, input: ToolInputOf<T, N>, speaker: Speaker) => Promise<unknown>
}

export type WriteHandlers<T extends ToolSet, Ctx> = {
  [N in ToolNamesOf<T, "write">]: (ctx: Ctx, input: ToolInputOf<T, N>, speaker: Speaker) => Promise<unknown>
}

/** Pour chaque outil `confirm` ou `send` : la carte (lecture seule) et l'exécution (au clic seulement). */
export type ConfirmHandlers<T extends ToolSet, Ctx extends { db: unknown }> = {
  [N in ToolNamesOf<T, CardKind>]: {
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

/** La mise en garde ajoutée en tête d'une carte proposée après des données privées et du contenu non fiable. */
export const TRIFECTA_DETAIL: ActionDetail = {
  label: "Attention",
  value:
    "Cette action suit la lecture de données privées et de contenu venu de tiers. Vérifie le destinataire et le contenu avant de confirmer.",
}

function checkedCall(tools: ToolSet, name: string, input: unknown, kinds: ReadonlyArray<ToolKind>) {
  const parsed = parseToolCall(tools, name, input)
  if (!parsed.ok) throw new ConvexError(parsed.message)
  if (!kinds.includes(parsed.kind)) throw new ConvexError(`Outil ${name} : pas un outil « ${kinds.join(" » ou « ")} ».`)
  return parsed
}

const CARD_KINDS: ReadonlyArray<ToolKind> = ["confirm", "send"]

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
  const call = checkedCall(args.tools, args.name, args.input, ["read"])
  const handler = handlerOf<(ctx: Ctx, input: unknown, speaker: Speaker) => Promise<unknown>>(handlers, call.name)
  return toolResult(await handler(ctx, call.input, args.speaker), undefined, { markup: args.markup ?? false })
}

/** Un outil d'écriture sans envoi, dans une mutation du produit, pendant un tour en cours. */
export async function runWriteTool<T extends ToolSet, Ctx extends AssistantWriter>(
  ctx: Ctx,
  args: TurnCallArgs<T>,
  handlers: WriteHandlers<T, Ctx>,
): Promise<string> {
  const call = checkedCall(args.tools, args.name, args.input, ["write"])
  await assertTurn(ctx, args.speaker, args.threadId, args.messageId)
  const handler = handlerOf<(ctx: Ctx, input: unknown, speaker: Speaker) => Promise<unknown>>(handlers, call.name)
  return toolResult(await handler(ctx, call.input, args.speaker), undefined, { markup: args.markup ?? false })
}

/**
 * Un outil `confirm` ou `send` pendant le tour : décrit la carte avec un `ctx` en lecture seule,
 * empreinte ce qu'elle montre, l'enregistre. Rien ne s'exécute ici. `trifecta` (posé par `runTurn`) :
 * le tour a lu des données privées et du contenu non fiable, la carte porte une mise en garde.
 */
export async function runProposeTool<T extends ToolSet, Ctx extends AssistantWriter>(
  ctx: Ctx,
  args: TurnCallArgs<T> & { now?: number; trifecta?: boolean },
  handlers: ConfirmHandlers<T, Ctx>,
): Promise<string> {
  const call = checkedCall(args.tools, args.name, args.input, CARD_KINDS)
  await assertTurn(ctx, args.speaker, args.threadId, args.messageId)
  const { card } = handlerOf<{
    card: (ctx: ReadOnlyCtx<Ctx>, input: unknown, speaker: Speaker) => Promise<Card>
  }>(handlers, call.name)
  const described = await card(readOnly(ctx), call.input, args.speaker)
  // La mise en garde s'affiche sans entrer dans l'empreinte : la carte redécrite au clic reste comparable.
  const details = [...(args.trifecta ? [TRIFECTA_DETAIL] : []), ...(described.details ?? [])]
  const actionId = await db(ctx).insert("assistantActions", {
    threadId: args.threadId,
    organizationId: args.speaker.organizationId,
    messageId: args.messageId,
    tool: call.name,
    input: JSON.stringify(call.input),
    summary: described.summary,
    details,
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

  const call = checkedCall(options.tools, action.tool, JSON.parse(action.input) as unknown, CARD_KINDS)
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
