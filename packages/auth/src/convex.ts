import type { Auth, UserIdentity } from "convex/server"
import { ConvexError } from "convex/values"

import { acceptedIssuers, HGDC_ISSUER, HGDC_PROVIDER_ID, highestRole, ORG_ROLES, type OrgRole } from "./index.ts"

export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN"

/**
 * Raison précise d'un refus, stable d'une version à l'autre : c'est elle qu'un produit lit pour
 * choisir quoi afficher, jamais le texte de `message`.
 * - `no_session` : personne n'est connecté (`UNAUTHENTICATED`) ;
 * - `wrong_issuer` : jeton d'un autre émetteur que celui attendu (`UNAUTHENTICATED`) ;
 * - `unknown_user` : jeton de l'app de bureau valide, mais la personne ne s'est encore jamais
 *   connectée à ce produit (`UNAUTHENTICATED`) : une connexion au produit la crée ;
 * - `not_member` : la personne n'appartient pas à l'organisation (`FORBIDDEN`) ;
 * - `insufficient_role` : elle en est membre, mais son rôle ne suffit pas (`FORBIDDEN`).
 */
export type AuthErrorReason = "no_session" | "wrong_issuer" | "unknown_user" | "not_member" | "insufficient_role"

/** Messages des gardes, au tutoiement : ils s'affichent tels quels aux personnes. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<AuthErrorReason, string>> = {
  no_session: "Connecte-toi pour continuer.",
  wrong_issuer: "Connecte-toi pour continuer.",
  unknown_user: "Connecte-toi une première fois à ce produit pour continuer.",
  not_member: "Tu n'as pas accès à cette organisation.",
  insufficient_role: "Ton rôle dans cette organisation ne permet pas cette action.",
}

const CODE_OF: Readonly<Record<AuthErrorReason, AuthErrorCode>> = {
  no_session: "UNAUTHENTICATED",
  wrong_issuer: "UNAUTHENTICATED",
  unknown_user: "UNAUTHENTICATED",
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
  /** `session` : jeton du produit ; `app` : id_token d'Account émis pour l'app de bureau. */
  via: UserAccess["via"]
  /** En `app` : identifiant Account de la personne (`identity.subject` est celui du produit). */
  accountUserId?: string
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
 * Variable d'environnement d'un produit qui ouvre son Convex à l'app de bureau : l'identifiant du
 * client OAuth de l'app chez Account. Absente, le produit n'accepte que ses propres jetons.
 */
export const APP_CLIENT_ID_ENV = "HGDC_APP_CLIENT_ID"

/** Fournisseur `customJwt` de `convex/auth.config.ts`. */
export type AppAuthProvider = {
  type: "customJwt"
  issuer: string
  jwks: string
  algorithm: "RS256"
  applicationID: string
}

/** Émetteur d'Account : HTTPS obligatoire (les clés publiques en viennent), sauf Account local. */
function appIssuer(env: ConvexIssuerEnv): string {
  const issuer = normalizeIssuer(optionalEnv(env, "HGDC_ISSUER") ?? HGDC_ISSUER)
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${issuer}/`)
  if (!issuer.startsWith("https://") && !local) throw new Error(`HGDC_ISSUER doit être en https : ${issuer}`)
  return issuer
}

/**
 * Fournisseur à ajouter à `convex/auth.config.ts` pour accepter l'id_token qu'Account émet pour
 * l'app de bureau (RS256, clés publiées par Account). `applicationID` limite l'acceptation à
 * l'audience de l'app : un id_token émis pour un autre client d'Account reste refusé par Convex.
 * Liste vide sans `HGDC_APP_CLIENT_ID`.
 *
 * L'émetteur de production a deux noms le temps de la migration (`acceptedIssuers`, ADR 0015 de la
 * famille) : un fournisseur par nom, tous avec les clés de l'émetteur configuré. Même serveur, même
 * clé : seule l'adresse des clés change, une fois, quand `HGDC_ISSUER` change.
 *
 * ```ts
 * providers: [...convexAuthProviders(provider, process.env), ...appAuthProviders(process.env)]
 * ```
 */
export function appAuthProviders(env: ConvexIssuerEnv): AppAuthProvider[] {
  const clientId = optionalEnv(env, APP_CLIENT_ID_ENV)
  if (!clientId) return []
  const issuer = appIssuer(env)
  return acceptedIssuers(issuer).map((name) => ({
    type: "customJwt",
    issuer: name,
    jwks: `${issuer}/jwks`,
    algorithm: "RS256",
    applicationID: clientId,
  }))
}

/**
 * Retrouve l'utilisateur du produit d'après son identifiant Account (`sub` de l'id_token), ou
 * `null` s'il ne s'est jamais connecté au produit. Avec better-auth : la ligne `account` dont
 * `providerId` vaut `HGDC_PROVIDER_ID` et `accountId` cet identifiant.
 */
export type AccountUserResolver<Ctx> = (ctx: Ctx, accountUserId: string) => Promise<string | null>

/**
 * Recherche, dans le composant better-auth du produit, du compte relié à un identifiant Account :
 * `providerId` est imposé, un compte d'un autre fournisseur (`credential`…) ne compte jamais.
 *
 * ```ts
 * const row = await ctx.runQuery(components.betterAuth.adapter.findOne, hgdcAccountLookup(id))
 * return userIdOfAccount(row)
 * ```
 */
export type AccountLookup = { model: "account"; where: { field: "accountId" | "providerId"; value: string }[] }

export function hgdcAccountLookup(accountUserId: string): AccountLookup {
  return {
    model: "account",
    where: [
      { field: "accountId", value: accountUserId },
      { field: "providerId", value: HGDC_PROVIDER_ID },
    ],
  }
}

/** Utilisateur du produit d'une ligne `account` lue par `hgdcAccountLookup`, ou `null`. */
export function userIdOfAccount(row: unknown): string | null {
  if (typeof row !== "object" || row === null || !("userId" in row)) return null
  return typeof row.userId === "string" && row.userId !== "" ? row.userId : null
}

/**
 * Accès de l'app de bureau : émetteurs de ses jetons (les noms de l'émetteur d'Account,
 * `acceptedIssuers`) et passage à l'utilisateur du produit.
 */
export type AppAccess<Ctx> = { issuer: string | readonly string[]; resolveUser: AccountUserResolver<Ctx> }

/**
 * Accès de l'app de bureau à donner aux gardes, ou `undefined` sans `HGDC_APP_CLIENT_ID` : les
 * jetons de l'app sont alors refusés (`wrong_issuer`), comme Convex les refuse déjà.
 */
export function appAccess<Ctx>(
  env: ConvexIssuerEnv,
  resolveUser: AccountUserResolver<Ctx>,
): AppAccess<Ctx> | undefined {
  return optionalEnv(env, APP_CLIENT_ID_ENV) ? { issuer: appIssuer(env), resolveUser } : undefined
}

/** Émetteurs du produit, plus l'accès facultatif de l'app de bureau. */
export type UserOption<Ctx> = IssuerOption & { app?: AppAccess<Ctx> | undefined }

/**
 * `identity.subject` désigne toujours l'utilisateur du produit : en `app`, il est remplacé par
 * l'utilisateur retrouvé, et l'identifiant Account reste dans `accountUserId`.
 */
export type UserAccess = {
  identity: UserIdentity
  userId: string
  via: "session" | "app"
  accountUserId?: string
}

/**
 * Utilisateur du produit derrière la requête. Un jeton du produit (`issuer`) le désigne par son
 * `subject` ; un id_token de l'app de bureau (`app`) par son identifiant Account, que
 * `app.resolveUser` traduit. Les deux émetteurs ne doivent jamais se confondre : un `subject`
 * d'Account lu comme un identifiant du produit désignerait une autre personne.
 */
export async function requireUser<Ctx extends { auth: Auth }>(ctx: Ctx, options: UserOption<Ctx>): Promise<UserAccess> {
  const app = options.app
  if (!app) return withSubject(await requireIdentity(ctx, options))
  const appIssuers = acceptedIssuers(app.issuer)
  const own = (typeof options.issuer === "string" ? [options.issuer] : options.issuer).map(normalizeIssuer)
  if (own.some((issuer) => appIssuers.includes(issuer)))
    throw new Error("requireUser : l'émetteur de l'app est aussi celui du produit.")
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw authError("no_session")
  if (!appIssuers.includes(normalizeIssuer(identity.issuer))) return withSubject(await requireIdentity(ctx, options))
  const userId = await app.resolveUser(ctx, identity.subject)
  if (!userId) throw authError("unknown_user")
  return { identity: { ...identity, subject: userId }, userId, via: "app", accountUserId: identity.subject }
}

function withSubject(identity: UserIdentity): UserAccess {
  return { identity, userId: identity.subject, via: "session" }
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
  options: UserOption<Ctx> & { load: MembershipLoader<Ctx>; minRole?: OrgRole },
): Promise<OrgAccess> {
  const { identity, userId, via, accountUserId } = await requireUser(ctx, options)
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
  return { identity, userId, via, ...(accountUserId ? { accountUserId } : {}), membership, role }
}
