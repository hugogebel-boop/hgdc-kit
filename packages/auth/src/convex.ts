import type { Auth, UserIdentity } from "convex/server"
import { ConvexError } from "convex/values"

import { highestRole, ORG_ROLES, type OrgRole } from "./index.ts"

export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN"

/**
 * Raison précise d'un refus, stable d'une version à l'autre : c'est elle qu'un produit lit pour
 * choisir quoi afficher, jamais le texte de `message`.
 * - `no_session` : personne n'est connecté (`UNAUTHENTICATED`) ;
 * - `wrong_issuer` : jeton d'un autre émetteur que celui attendu (`UNAUTHENTICATED`) ;
 * - `not_member` : la personne n'appartient pas à l'organisation (`FORBIDDEN`) ;
 * - `insufficient_role` : elle en est membre, mais son rôle ne suffit pas (`FORBIDDEN`).
 */
export type AuthErrorReason = "no_session" | "wrong_issuer" | "not_member" | "insufficient_role"

/** Messages des gardes, au tutoiement : ils s'affichent tels quels aux personnes. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<AuthErrorReason, string>> = {
  no_session: "Connecte-toi pour continuer.",
  wrong_issuer: "Connecte-toi pour continuer.",
  not_member: "Tu n'as pas accès à cette organisation.",
  insufficient_role: "Ton rôle dans cette organisation ne permet pas cette action.",
}

const CODE_OF: Readonly<Record<AuthErrorReason, AuthErrorCode>> = {
  no_session: "UNAUTHENTICATED",
  wrong_issuer: "UNAUTHENTICATED",
  not_member: "FORBIDDEN",
  insufficient_role: "FORBIDDEN",
}

/** Données d'une `ConvexError` levée par les gardes : `message` est affichable tel quel. */
export type AuthErrorData = { code: AuthErrorCode; reason: AuthErrorReason; message: string }

/** Lien entre une personne et une organisation, tel que le produit le stocke. */
export type Membership = {
  organizationId: string
  userId: string
  /** Champ `role` de better-auth, éventuellement plusieurs rôles séparés par des virgules. */
  role: string
}

/**
 * Lit l'appartenance de `userId` à `organizationId`, ou `null`. Account la lit dans les
 * tables du plugin `organization` ; un produit, dans sa copie synchronisée depuis Account.
 */
export type MembershipLoader<Ctx> = (
  ctx: Ctx,
  args: { organizationId: string; userId: string },
) => Promise<Membership | null>

export type OrgAccess = {
  identity: UserIdentity
  userId: string
  membership: Membership
  role: OrgRole
}

function authError(reason: AuthErrorReason): ConvexError<AuthErrorData> {
  return new ConvexError({ code: CODE_OF[reason], reason, message: AUTH_ERROR_MESSAGES[reason] })
}

/** Vrai si `error` vient d'une garde de ce module. */
export function isAuthError(error: unknown): error is ConvexError<AuthErrorData> {
  if (!(error instanceof ConvexError)) return false
  const data: unknown = error.data
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    (data.code === "UNAUTHENTICATED" || data.code === "FORBIDDEN")
  )
}

function isReason(value: unknown): value is AuthErrorReason {
  return typeof value === "string" && Object.hasOwn(CODE_OF, value)
}

/**
 * Raison d'un refus des gardes, ou `null` si `error` n'en vient pas. Côté client, l'erreur
 * arrive sérialisée (`ConvexError` reconstruite par le client Convex) : la lecture vaut des deux
 * côtés. Une erreur d'une version d'avant `reason` (0.3) est déduite de son code.
 */
export function authErrorReason(error: unknown): AuthErrorReason | null {
  if (!isAuthError(error)) return null
  const data: unknown = error.data
  if (typeof data === "object" && data !== null && "reason" in data && isReason(data.reason)) return data.reason
  return error.data.code === "UNAUTHENTICATED" ? "no_session" : "not_member"
}

/**
 * Émetteur des jetons dont le `subject` désigne un utilisateur du produit. Avec le plugin
 * `convex` de better-auth : `process.env.CONVEX_SITE_URL`, ou `convexIssuers(process.env)`.
 * Un `subject` n'est unique que chez son émetteur : sans ce contrôle, un autre fournisseur
 * accepté par Convex pourrait présenter le `subject` d'un membre et prendre ses droits.
 *
 * Une liste ne sert qu'à donner plusieurs adresses au même émetteur, le temps d'un changement
 * de domaine du déploiement : l'appartenance est cherchée par `subject`, qui ne distingue pas
 * deux fournisseurs. Jamais deux bases d'utilisateurs différentes.
 */
export type IssuerOption = { issuer: string | readonly string[] }

/** Variables d'environnement lues par `convexIssuers` et `convexAuthProviders`. */
export type ConvexIssuerEnv = Readonly<Record<string, string | undefined>>

function normalizeIssuer(value: string) {
  return value.replace(/\/+$/, "")
}

/**
 * Émetteurs des jetons du plugin `convex` de better-auth sur ce déploiement, à passer tels quels
 * à `requireIdentity` et `requireOrgMember` : `CONVEX_SITE_URL`, plus `CONVEX_PREVIOUS_SITE_URL`
 * quand elle est posée.
 *
 * `CONVEX_PREVIOUS_SITE_URL` ne vit que pendant la bascule d'un domaine : l'ancienne adresse
 * `actions` du déploiement, pour que les jetons émis avant la bascule restent valables jusqu'à
 * leur expiration (15 minutes). Elle se retire ensuite.
 *
 * ```ts
 * await requireIdentity(ctx, { issuer: convexIssuers(process.env) })
 * ```
 */
export function convexIssuers(env: ConvexIssuerEnv): string[] {
  const issuers: string[] = []
  for (const value of [env.CONVEX_SITE_URL, env.CONVEX_PREVIOUS_SITE_URL]) {
    const issuer = value ? normalizeIssuer(value.trim()) : ""
    if (issuer && !issuers.includes(issuer)) issuers.push(issuer)
  }
  return issuers
}

/** Lit une variable facultative dans `auth.config.ts`, où Convex lève sur une variable absente. */
function optionalEnv(env: ConvexIssuerEnv, name: string): string | undefined {
  try {
    return env[name]?.trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Fournisseurs de `convex/auth.config.ts` : `provider` (celui de `getAuthConfigProvider`), plus
 * sa copie pour `CONVEX_PREVIOUS_SITE_URL` quand elle est posée, avec la même clé. Sans elle,
 * Convex refuse dès la bascule (`NoAuthProvider`) un jeton émis avant, sur une connexion neuve.
 *
 * La copie est gardée même si les deux adresses sont égales : elles le sont entre la pose de la
 * variable et le changement de domaine, et seule `CONVEX_SITE_URL` suit alors le domaine.
 * Le plugin `convex` de better-auth refuse deux fournisseurs `applicationID: "convex"` : il
 * reçoit `currentAuthConfig(authConfig)`.
 *
 * ```ts
 * export default {
 *   providers: convexAuthProviders(getAuthConfigProvider({ jwks: process.env.JWKS }), process.env),
 * } satisfies AuthConfig
 * ```
 */
export function convexAuthProviders<P extends { issuer: string }>(provider: P, env: ConvexIssuerEnv): P[] {
  // Convex refuse un push dont auth.config.ts lit une variable absente, et n'y énumère pas
  // `process.env` (`in`, `Object.keys` ne voient rien) : seule une lecture directe, rattrapée, convient.
  const previous = optionalEnv(env, "CONVEX_PREVIOUS_SITE_URL")
  return previous ? [provider, { ...provider, issuer: normalizeIssuer(previous) }] : [provider]
}

/**
 * Configuration à donner au plugin `convex` de better-auth : le seul fournisseur courant, le
 * premier de `convexAuthProviders`.
 *
 * ```ts
 * convex({ authConfig: currentAuthConfig(authConfig), jwks: process.env.JWKS })
 * ```
 */
export function currentAuthConfig<P>(config: { providers: readonly P[] }): { providers: P[] } {
  return { providers: config.providers.slice(0, 1) }
}

/**
 * Identité de la personne connectée, émise par `issuer` (ou l'un d'eux), ou erreur
 * `UNAUTHENTICATED`.
 */
export async function requireIdentity(ctx: { auth: Auth }, options: IssuerOption): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw authError("no_session")
  const expected = (typeof options.issuer === "string" ? [options.issuer] : options.issuer)
    .map(normalizeIssuer)
    .filter((issuer) => issuer !== "")
  if (expected.length === 0) throw new Error("requireIdentity : émetteur attendu manquant (CONVEX_SITE_URL ?).")
  if (!expected.includes(normalizeIssuer(identity.issuer))) throw authError("wrong_issuer")
  return identity
}

/**
 * Garde d'une fonction Convex publique sur une ressource d'organisation : à appeler
 * avant toute lecture ou écriture. Exige une session de l'émetteur attendu, l'appartenance à l'organisation
 * et au moins le rôle `minRole` (par défaut `member`).
 *
 * Une personne étrangère à l'organisation et un membre au rôle insuffisant reçoivent
 * tous deux `FORBIDDEN`, distingués par `reason` (`not_member`, `insufficient_role`).
 */
export async function requireOrgMember<Ctx extends { auth: Auth }>(
  ctx: Ctx,
  organizationId: string,
  options: IssuerOption & { load: MembershipLoader<Ctx>; minRole?: OrgRole },
): Promise<OrgAccess> {
  const identity = await requireIdentity(ctx, options)
  const userId = identity.subject
  const membership = await options.load(ctx, { organizationId, userId })
  // Une copie mal synchronisée ne doit jamais ouvrir l'accès à la mauvaise personne.
  if (!membership || membership.userId !== userId || membership.organizationId !== organizationId) {
    throw authError("not_member")
  }
  const role = highestRole(membership.role)
  const minRole = options.minRole ?? "member"
  if (role === null || ORG_ROLES.indexOf(role) < ORG_ROLES.indexOf(minRole)) {
    throw authError("insufficient_role")
  }
  return { identity, userId, membership, role }
}
