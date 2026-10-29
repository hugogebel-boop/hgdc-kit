import { db, type AssistantReader, type AssistantWriter } from "./context.ts"
import { eraseThread } from "./threads.ts"

/*
 * Droits d'une personne (nLPD) : effacement et export de ses données d'assistant.
 */

/**
 * Effacement d'une personne, par lots : ses conversations dans toutes les organisations, et son
 * identifiant retiré des clés qu'elle a posées. Tant que `done` est faux, le produit replanifie
 * la même mutation.
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

/** Export des données d'une personne : conversations, demandes, réponses et cartes. */
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
