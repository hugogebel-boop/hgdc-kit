/**
 * Purge des lignes expirées de better-auth sur Convex, commune aux produits.
 *
 * better-auth n'efface une session expirée que lorsqu'elle est relue, et une ligne `verification`
 * expirée (code d'e-mail, état OAuth, épreuve 2FA) que lorsqu'elle est consommée. Une session
 * abandonnée garde donc pour toujours son adresse IP et son navigateur. Le produit appelle
 * `purgeExpiredAuthBatch` depuis une `internalMutation` lancée chaque heure par un cron.
 *
 * Seules les lignes dont `expiresAt` est passé sont touchées : better-auth les refuse déjà toutes.
 * Une session valable n'est jamais effacée. L'index `expiresAt` du schéma du composant
 * (`session` et `verification`) borne la lecture aux lignes expirées.
 */

import type { FunctionReference, GenericDataModel, GenericMutationCtx } from "convex/server"
import { v, type VLiteral, type VNull, type VString, type VUnion } from "convex/values"

/** Tables purgées, dans l'ordre : les sessions, puis les vérifications. */
export const AUTH_EXPIRED_MODELS = ["session", "verification"] as const

export type AuthExpiredModel = (typeof AUTH_EXPIRED_MODELS)[number]

/** Lignes effacées par appel ; la suite est replanifiée tant que la table n'est pas parcourue. */
export const AUTH_EXPIRED_PURGE_BATCH = 500

/** Arguments de la mutation de purge du produit. Le cron part de `{ model: "session", cursor: null }`. */
export const purgeExpiredAuthArgs: {
  model: VUnion<
    AuthExpiredModel,
    [VLiteral<"session", "required">, VLiteral<"verification", "required">],
    "required",
    never
  >
  cursor: VUnion<string | null, [VString<string, "required">, VNull<null, "required">], "required", never>
} = {
  model: v.union(v.literal("session"), v.literal("verification")),
  cursor: v.union(v.string(), v.null()),
}

/** Condition better-auth : `expiresAt` strictement avant `now`. */
export function expiredWhere(now: number): [{ field: "expiresAt"; operator: "lt"; value: number }] {
  return [{ field: "expiresAt", operator: "lt", value: now }]
}

/** Table suivante à purger, ou `null` après la dernière. */
export function nextExpiredModel(model: AuthExpiredModel): AuthExpiredModel | null {
  return AUTH_EXPIRED_MODELS[AUTH_EXPIRED_MODELS.indexOf(model) + 1] ?? null
}

type PurgeCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation" | "scheduler">

/**
 * Un lot de purge : efface les lignes expirées de `model` par `deleteMany` du composant better-auth
 * (`components.betterAuth.adapter.deleteMany`), puis replanifie `next` (la mutation du produit) sur
 * la suite de la table, puis sur la table suivante.
 */
export async function purgeExpiredAuthBatch(
  ctx: PurgeCtx,
  refs: {
    deleteMany: FunctionReference<"mutation", "internal">
    next: FunctionReference<"mutation", "internal", { model: AuthExpiredModel; cursor: string | null }>
  },
  args: { model: AuthExpiredModel; cursor: string | null },
  now: number = Date.now(),
): Promise<null> {
  const result = (await ctx.runMutation(refs.deleteMany, {
    input: { model: args.model, where: expiredWhere(now) },
    paginationOpts: { numItems: AUTH_EXPIRED_PURGE_BATCH, cursor: args.cursor },
  })) as { isDone: boolean; continueCursor: string }
  if (!result.isDone) {
    await ctx.scheduler.runAfter(0, refs.next, { model: args.model, cursor: result.continueCursor })
    return null
  }
  const model = nextExpiredModel(args.model)
  if (model) await ctx.scheduler.runAfter(0, refs.next, { model, cursor: null })
  return null
}
