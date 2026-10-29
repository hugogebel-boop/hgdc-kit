import { db, STUCK_AFTER_MS, TURN_TEXTS, type AssistantWriter } from "./context.ts"
import { settleMessage } from "./credits.ts"
import { eraseThread } from "./threads.ts"

/*
 * Entretien, à appeler depuis les crons du produit.
 */

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

/** Lot par défaut de `purgeIdleThreads` : un lot plein se replanifie. */
export const PURGE_BATCH = 50

/** Conversations sans activité depuis `before` (90 jours conseillés) : effacées par lots. */
export async function purgeIdleThreads(
  ctx: AssistantWriter,
  options: { before: number; limit?: number },
): Promise<number> {
  const rows = await db(ctx)
    .query("assistantThreads")
    .withIndex("by_updated", (q) => q.lt("updatedAt", options.before))
    .take(options.limit ?? PURGE_BATCH)
  for (const row of rows) await eraseThread(ctx, row._id)
  return rows.length
}
