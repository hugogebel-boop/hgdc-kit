/**
 * Limite de connexion de better-auth sur Convex, commune aux produits.
 *
 * - `SERVER_AUTH_PATHS` : chemins appelés par des serveurs (jeton Convex demandé par le rendu serveur
 *   du front, clés lues par Convex). Ils arrivent tous sous une seule adresse, sans signature : limités,
 *   une centaine de rendus anonymes en 10 s couperaient le jeton de tout le monde.
 * - `HGDC_RATE_LIMIT` : réglage `rateLimit` de better-auth (gardé en base, chemins serveur exclus).
 * - `purgeAuthRateLimitBatch` : better-auth ne retire jamais une ligne de sa table `rateLimit` ; le
 *   produit l'appelle depuis une `internalMutation` lancée chaque heure par un cron.
 */

import type { FunctionReference, GenericDataModel, GenericMutationCtx } from "convex/server"
import { v, type VNull, type VString, type VUnion } from "convex/values"

/** Chemins de better-auth (relatifs à sa base, `/api/auth`) jamais limités. */
export const SERVER_AUTH_PATHS: { readonly [path: string]: false } = {
  "/convex/token": false,
  "/convex/jwks": false,
  "/convex/.well-known/openid-configuration": false,
}

/**
 * Réglage `rateLimit` de better-auth : en base (en mémoire, il ne survit pas d'un appel Convex à
 * l'autre), sans limite sur `SERVER_AUTH_PATHS`. Les règles par défaut restent : 3 essais par 10 s sur
 * `/sign-in/*`, 100 par 10 s ailleurs.
 */
export const HGDC_RATE_LIMIT: {
  enabled: true
  storage: "database"
  customRules: { [path: string]: false }
} = { enabled: true, storage: "database", customRules: { ...SERVER_AUTH_PATHS } }

/** Plus longue fenêtre des règles de better-auth : 60 s. Une ligne d'une heure ne compte plus. */
export const AUTH_RATE_LIMIT_KEEP_MS: number = 60 * 60 * 1000

/** Lignes effacées par appel ; la suite est replanifiée tant que la table n'est pas parcourue. */
export const AUTH_RATE_LIMIT_PURGE_BATCH = 500

/** Arguments de la mutation de purge du produit. */
export const purgeAuthRateLimitArgs: {
  cursor: VUnion<string | null, [VString<string, "required">, VNull<null, "required">], "required", never>
} = { cursor: v.union(v.string(), v.null()) }

type PurgeCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation" | "scheduler">

/**
 * Un lot de purge : efface les lignes de `rateLimit` plus vieilles que `AUTH_RATE_LIMIT_KEEP_MS` par
 * `deleteMany` du composant better-auth, puis replanifie `next` (la mutation du produit) tant qu'il en
 * reste. `deleteMany` : `components.betterAuth.adapter.deleteMany`.
 */
export async function purgeAuthRateLimitBatch(
  ctx: PurgeCtx,
  refs: {
    deleteMany: FunctionReference<"mutation", "internal">
    next: FunctionReference<"mutation", "internal", { cursor: string | null }>
  },
  cursor: string | null,
  now: number = Date.now(),
): Promise<null> {
  const result = (await ctx.runMutation(refs.deleteMany, {
    input: {
      model: "rateLimit",
      where: [{ field: "lastRequest", operator: "lt", value: now - AUTH_RATE_LIMIT_KEEP_MS }],
    },
    paginationOpts: { numItems: AUTH_RATE_LIMIT_PURGE_BATCH, cursor },
  })) as { isDone: boolean; continueCursor: string }
  if (!result.isDone) await ctx.scheduler.runAfter(0, refs.next, { cursor: result.continueCursor })
  return null
}
