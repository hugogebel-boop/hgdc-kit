import { db, type AssistantReader, type AssistantWriter } from "./context.ts"

/*
 * La clé Anthropic propre d'une organisation, scellée par l'action du produit
 * (`@hgdc/assistant/secret`). Dépréciée hors développement local : le traitement a lieu aux
 * États-Unis (ADR 0011 de la famille). Gardée pour lire, retirer et effacer les clés existantes.
 */

export async function ownKey(ctx: AssistantReader, organizationId: string) {
  return await db(ctx)
    .query("assistantKeys")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .first()
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
