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
 * `convex` de better-auth : `process.env.CONVEX_SITE_URL`. Un `subject` n'est unique que chez
 * son émetteur : sans ce contrôle, un autre fournisseur accepté par Convex pourrait présenter
 * le `subject` d'un membre et prendre ses droits. Un seul émetteur : l'appartenance est
 * cherchée par `subject`, qui ne distingue pas deux fournisseurs.
 */
export type IssuerOption = { issuer: string }

function normalizeIssuer(value: string) {
  return value.replace(/\/+$/, "")
}

/** Identité de la personne connectée, émise par `issuer`, ou erreur `UNAUTHENTICATED`. */
export async function requireIdentity(ctx: { auth: Auth }, options: IssuerOption): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw authError("no_session")
  if (!options.issuer) throw new Error("requireIdentity : émetteur attendu manquant (CONVEX_SITE_URL ?).")
  if (normalizeIssuer(identity.issuer) !== normalizeIssuer(options.issuer)) throw authError("wrong_issuer")
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
