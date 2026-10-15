import { z } from "zod"

/** Identifiant du fournisseur dans `genericOAuth` et dans la table `account` des produits. */
export const HGDC_PROVIDER_ID = "hgdc"

/** Émetteur OIDC de HGDC Account (`iss` des jetons, base de la découverte). */
export const HGDC_ISSUER = "https://account.hgdc.ch/api/auth"

/** Portée qui ajoute les organisations de la personne et son rôle dans chacune. */
export const ORGANIZATIONS_SCOPE = "organizations"

/** Portées demandées par défaut : identité, adresse vérifiée, renouvellement et organisations. */
export const HGDC_SCOPES: readonly string[] = ["openid", "profile", "email", "offline_access", ORGANIZATIONS_SCOPE]

/** Rôles d'organisation, du plus faible au plus fort. */
export const ORG_ROLES = ["member", "admin", "owner"] as const
export type OrgRole = (typeof ORG_ROLES)[number]

function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value)
}

/**
 * Rôle le plus fort d'un champ `role` de better-auth. Le plugin `organization` accepte
 * plusieurs rôles séparés par des virgules (« admin,member ») ; un rôle inconnu ne
 * donne aucun droit. `null` quand aucun rôle connu.
 */
export function highestRole(role: string): OrgRole | null {
  let best: OrgRole | null = null
  for (const part of role.split(",")) {
    const name = part.trim()
    if (isOrgRole(name) && (best === null || ORG_ROLES.indexOf(name) > ORG_ROLES.indexOf(best))) best = name
  }
  return best
}

/** Vrai si `role` atteint au moins `minimum`. */
export function hasRole(role: string, minimum: OrgRole): boolean {
  const best = highestRole(role)
  return best !== null && ORG_ROLES.indexOf(best) >= ORG_ROLES.indexOf(minimum)
}

const organizationClaim = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(ORG_ROLES),
})

const profileClaims = z.object({
  sub: z.string().min(1),
  email: z.email(),
  // Une adresse non vérifiée ne doit jamais créer ni relier un compte (liaison par e-mail).
  email_verified: z.literal(true),
  name: z.string().min(1),
  picture: z.url().nullish(),
  organizations: z.array(organizationClaim).optional(),
})

export type HgdcOrganization = {
  id: string
  slug: string
  name: string
  role: OrgRole
}

/** Profil d'une personne tel que HGDC Account le donne (id_token ou userinfo). */
export type HgdcProfile = {
  sub: string
  email: string
  email_verified: true
  name: string
  picture?: string | null | undefined
  /** Présent seulement si la portée `organizations` a été accordée. */
  organizations?: HgdcOrganization[] | undefined
}

/**
 * Valide les claims reçus de HGDC Account. Lève une erreur si un champ attendu manque ou si
 * l'adresse n'est pas vérifiée : un tel profil ne doit jamais ouvrir de session.
 */
export function parseHgdcProfile(claims: unknown): HgdcProfile {
  const result = profileClaims.safeParse(claims)
  if (!result.success) throw new Error(`Profil HGDC invalide : ${z.prettifyError(result.error)}`)
  return result.data
}

const organizationsClaim = z.object({ organizations: z.array(organizationClaim).optional() })

function decodeBase64Url(segment: string): string {
  const base64 = segment
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=")
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Organisations d'un id_token de HGDC Account. À n'appeler que sur un jeton reçu directement
 * du point de jeton d'Account par le serveur (champ `idToken` de la table `account` de
 * better-auth) : sa signature n'est pas revérifiée ici (OpenID Connect Core 3.1.3.7, point 6).
 * Lève une erreur si le jeton est illisible ou si un claim est invalide ; `[]` sans la portée.
 * À la connexion, préférer `verifiedOrganizationsFromIdToken`, qui contrôle aussi émetteur,
 * audience et fraîcheur.
 */
export function organizationsFromIdToken(idToken: string): HgdcOrganization[] {
  const payload = idToken.split(".")[1]
  if (!payload) throw new Error("id_token HGDC illisible")
  const result = organizationsClaim.safeParse(JSON.parse(decodeBase64Url(payload)))
  if (!result.success) throw new Error(`Organisations HGDC invalides : ${z.prettifyError(result.error)}`)
  return result.data.organizations ?? []
}

/** Appartenance d'une personne telle qu'un produit l'a copiée depuis Account. */
export type SyncedMembership = { organizationId: string; slug: string; name: string; role: OrgRole }

export type OrganizationSyncPlan = {
  /** Organisations à créer ou à mettre à jour chez le produit (espace et appartenance). */
  upsert: HgdcOrganization[]
  /** Organisations dont la personne ne fait plus partie : appartenance à retirer. */
  remove: string[]
}

/**
 * Écart entre les organisations reçues d'Account et la copie du produit, pour une personne.
 * Ne renvoie que ce qui change : une connexion sans changement n'écrit rien.
 */
export function planOrganizationSync(
  claimed: readonly HgdcOrganization[],
  current: readonly SyncedMembership[],
): OrganizationSyncPlan {
  const known = new Map(current.map((m) => [m.organizationId, m]))
  const claimedIds = new Set(claimed.map((o) => o.id))
  return {
    upsert: claimed.filter((org) => {
      const copy = known.get(org.id)
      return !copy || copy.role !== org.role || copy.slug !== org.slug || copy.name !== org.name
    }),
    remove: current.filter((m) => !claimedIds.has(m.organizationId)).map((m) => m.organizationId),
  }
}

/** Âge maximal d'un id_token lu à la connexion : il vient d'être reçu du point de jeton d'Account. */
export const ID_TOKEN_MAX_AGE_SECONDS: number = 10 * 60

/** Avance d'horloge tolérée entre Account et le produit, en secondes. */
export const ID_TOKEN_CLOCK_SKEW_SECONDS: number = 60

/** Pourquoi un id_token est refusé, pour les journaux : la personne ne voit que « Connexion HGDC requise ». */
export type IdTokenRejection = "unreadable" | "wrong_issuer" | "wrong_audience" | "stale" | "invalid_claims"

/** Erreur de `verifyHgdcIdToken` et `verifiedOrganizationsFromIdToken`. */
export class HgdcIdTokenError extends Error {
  readonly reason: IdTokenRejection
  constructor(reason: IdTokenRejection, message: string) {
    super(message)
    this.name = "HgdcIdTokenError"
    this.reason = reason
  }
}

export type IdTokenExpectation = {
  /** Émetteur attendu : `HGDC_ISSUER`, ou celui d'un Account de préproduction. */
  issuer: string
  /** Identifiant du client du produit : l'audience du jeton. */
  clientId: string
  /** Instant présent en millisecondes (`Date.now()`). */
  now: number
}

function payloadOf(idToken: string): Record<string, unknown> {
  const segment = idToken.split(".")[1]
  if (!segment) throw new HgdcIdTokenError("unreadable", "id_token HGDC illisible")
  let payload: unknown
  try {
    payload = JSON.parse(decodeBase64Url(segment))
  } catch {
    throw new HgdcIdTokenError("unreadable", "id_token HGDC illisible")
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new HgdcIdTokenError("unreadable", "id_token HGDC illisible")
  return payload as Record<string, unknown>
}

/**
 * Contrôle de provenance et de fraîcheur d'un id_token lu dans la table `account` de better-auth,
 * avant d'en recopier quoi que ce soit (OpenID Connect Core 3.1.3.7) :
 * - `iss` égal à l'émetteur attendu ;
 * - `aud` contient `clientId`, et `azp` vaut `clientId` quand il y a plusieurs audiences ;
 * - `iat` de moins de `ID_TOKEN_MAX_AGE_SECONDS`, pas dans le futur, et `exp` non dépassé.
 *
 * La signature n'est pas revérifiée : le jeton vient du point de jeton d'Account, reçu par le
 * serveur en TLS (point 6). Le contrôle de fraîcheur empêche qu'un jeton ancien, que
 * better-auth n'aurait pas réécrit, rejoue des organisations périmées.
 */
export function verifyHgdcIdToken(
  idToken: string,
  expected: IdTokenExpectation,
): { claims: Record<string, unknown>; organizations: HgdcOrganization[] } {
  if (!expected.issuer || !expected.clientId)
    throw new Error("verifyHgdcIdToken : émetteur ou clientId attendu manquant (HGDC_CLIENT_ID ?).")
  const claims = payloadOf(idToken)

  const issuer = typeof claims.iss === "string" ? claims.iss.replace(/\/+$/, "") : null
  if (issuer !== expected.issuer.replace(/\/+$/, ""))
    throw new HgdcIdTokenError("wrong_issuer", "id_token d'un autre émetteur")

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audience.includes(expected.clientId))
    throw new HgdcIdTokenError("wrong_audience", "id_token destiné à un autre client")
  if (audience.length > 1 && claims.azp !== expected.clientId)
    throw new HgdcIdTokenError("wrong_audience", "id_token destiné à un autre client")

  const now = Math.floor(expected.now / 1000)
  const iat = typeof claims.iat === "number" ? claims.iat : null
  if (iat === null || now - iat > ID_TOKEN_MAX_AGE_SECONDS || iat - now > ID_TOKEN_CLOCK_SKEW_SECONDS)
    throw new HgdcIdTokenError("stale", "id_token périmé")
  if (claims.exp !== undefined && (typeof claims.exp !== "number" || now - claims.exp > ID_TOKEN_CLOCK_SKEW_SECONDS))
    throw new HgdcIdTokenError("stale", "id_token périmé")

  const result = organizationsClaim.safeParse(claims)
  if (!result.success)
    throw new HgdcIdTokenError("invalid_claims", `Organisations HGDC invalides : ${z.prettifyError(result.error)}`)
  return { claims, organizations: result.data.organizations ?? [] }
}

/**
 * Organisations d'un id_token reçu à la connexion, après `verifyHgdcIdToken`. À appeler dans
 * `databaseHooks.session.create.before` : un jeton refusé fait échouer la connexion plutôt que
 * d'ouvrir une session sur des droits périmés.
 *
 * ```ts
 * const organizations = verifiedOrganizationsFromIdToken(account.idToken, {
 *   issuer: HGDC_ISSUER,
 *   clientId: process.env.HGDC_CLIENT_ID!,
 *   now: Date.now(),
 * })
 * ```
 */
export function verifiedOrganizationsFromIdToken(idToken: string, expected: IdTokenExpectation): HgdcOrganization[] {
  return verifyHgdcIdToken(idToken, expected).organizations
}

/**
 * Durée d'une session d'un produit, sans prolongation (`session: { expiresIn: SESSION_TTL_SECONDS,
 * disableSessionRefresh: true }`) : les organisations sont relues à chaque connexion, donc au
 * moins une fois tous les 7 jours.
 */
export const SESSION_TTL_SECONDS: number = 7 * 24 * 60 * 60

/**
 * Âge maximal d'une appartenance copiée depuis Account, en millisecondes : 8 jours, soit une
 * session de 7 jours et un jour de marge. Une copie plus ancienne n'est plus portée par aucune
 * session (personne retirée dans Account, session d'avant la synchronisation) : elle n'ouvre plus rien.
 */
export const MEMBERSHIP_TTL_MS: number = 8 * 24 * 60 * 60 * 1000

/**
 * Âge maximal de l'appartenance de la créatrice d'une clé d'API, qui vit hors session (CLI,
 * intégrations) : 30 jours. Passé ce délai sans reconnexion, la clé cesse d'agir.
 */
export const KEY_MEMBERSHIP_TTL_MS: number = 30 * 24 * 60 * 60 * 1000

/**
 * Vrai si l'appartenance a été confirmée par Account il y a moins de `ttl` (par défaut
 * `MEMBERSHIP_TTL_MS`). `syncedAt` : dernière synchronisation réussie, en millisecondes, mise
 * à jour même quand rien n'a changé. Une copie sans date n'est jamais fraîche.
 */
export function membershipIsFresh(
  membership: { syncedAt?: number | null | undefined },
  now: number,
  ttl: number = MEMBERSHIP_TTL_MS,
): boolean {
  const { syncedAt } = membership
  return typeof syncedAt === "number" && now - syncedAt <= ttl
}
