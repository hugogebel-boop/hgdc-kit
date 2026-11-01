import { z } from "zod"

/** Identifiant du fournisseur dans `genericOAuth` et dans la table `account` des produits. */
export const HGDC_PROVIDER_ID = "hgdc"

/** Émetteur OIDC d'ID (`iss` des jetons, base des points OAuth et des clés). Temps 4 de l'ADR 0015 de la famille. */
export const HGDC_ISSUER = "https://id.hgdc.ch/api/auth"

/** Même émetteur, nommé `HGDC_ISSUER` pendant la migration. Gardé jusqu'au temps 5 (ADR 0015). */
export const HGDC_ID_ISSUER: string = HGDC_ISSUER

/**
 * Ancien nom du même émetteur, sous `account.hgdc.ch`. Accepté jusqu'à la fin de la fenêtre
 * (temps 5 de l'ADR 0015, contrôle le 2026-12-08) : jetons et retours d'autorisation émis sous ce
 * nom, clients MCP qui l'ont découvert.
 */
export const HGDC_LEGACY_ISSUER = "https://account.hgdc.ch/api/auth"

/**
 * Les deux noms de l'émetteur de production pendant la migration vers ID (ADR 0015). Même serveur
 * d'autorisation, même base, même clé de signature : jamais un autre fournisseur.
 */
export const HGDC_ACCEPTED_ISSUERS: readonly string[] = Object.freeze([HGDC_LEGACY_ISSUER, HGDC_ISSUER])

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

/**
 * Émetteurs à accepter quand on attend `expected` : les deux noms de l'émetteur de production
 * (`HGDC_ACCEPTED_ISSUERS`) si `expected` en contient un, sinon `expected` seul (Account local ou
 * d'essai, `HGDC_ISSUER` posé dans l'environnement). Sans barre finale, sans doublon.
 */
export function acceptedIssuers(expected: string | readonly string[]): string[] {
  const given = (typeof expected === "string" ? [expected] : expected)
    .map((issuer) => withoutTrailingSlash(issuer.trim()))
    .filter((issuer) => issuer !== "")
  const production = given.some((issuer) => HGDC_ACCEPTED_ISSUERS.includes(issuer))
  return [...new Set(production ? [...given, ...HGDC_ACCEPTED_ISSUERS] : given)]
}

/** Portée qui ajoute les organisations de la personne et son rôle dans chacune. */
export const ORGANIZATIONS_SCOPE = "organizations"

/** Portées demandées par défaut : identité, adresse vérifiée, renouvellement et organisations. */
export const HGDC_SCOPES: readonly string[] = ["openid", "profile", "email", "offline_access", ORGANIZATIONS_SCOPE]

/**
 * Entrée commune des produits : `https://<mot>.hgdc.ch/auth/hgdc?next=<chemin>` ouvre le produit
 * avec la session HGDC Account, sans page d'accueil ni bouton (`createHgdcEntry`, `@hgdc/auth/server`).
 * Le menu « Produits » de `@hgdc/ui` y pointe : même chemin dans chaque produit.
 */
export const HGDC_ENTRY_PATH = "/auth/hgdc"

/** Paramètre de l'entrée qui porte la page d'arrivée. */
export const HGDC_ENTRY_NEXT_PARAM = "next"

/**
 * `refresh=1` sur l'entrée : repasser par Account même si la session du produit est ouverte. Le
 * claim `organizations` n'est lu qu'à la création d'une session ; une organisation rejointe dans
 * Account n'apparaît dans le produit qu'à la session suivante. La nouvelle session relit le claim.
 */
export const HGDC_ENTRY_REFRESH_PARAM = "refresh"

/**
 * Ajouté à `next` au retour d'un `refresh` (`?synced=1`) : la page sait que les organisations
 * viennent d'être relues et ne relance pas l'entrée (une seule resynchronisation par navigation).
 */
export const HGDC_SYNCED_PARAM = "synced"

/**
 * `refresh=background` sur l'entrée (barre des produits, ADR 0016) : avec une session du produit
 * ouverte, l'entrée va droit à `next` et pose `HGDC_ORG_SYNC_COOKIE` ; la page d'arrivée relit les
 * organisations en arrière-plan (`HGDC_BACKGROUND_REFRESH_PATH`). Sans session : connexion HGDC
 * habituelle, qui lit déjà les organisations. Un produit plus ancien l'ignore (pas de relecture).
 */
export const HGDC_ENTRY_REFRESH_BACKGROUND = "background"

/**
 * Cookie du produit posé par l'entrée `refresh=background` : « relire les organisations ». Lu et
 * effacé par la page d'arrivée (`@hgdc/ui/app-shell`). Lisible en JavaScript, il ne porte que `1`
 * ou, pour un produit servi sous un chemin, ce chemin (`/analytics`, cookie limité à ce chemin) :
 * le forger ne fait que lancer une relecture par Account.
 */
export const HGDC_ORG_SYNC_COOKIE = "hgdc-org-sync"

/** Durée de vie du cookie `HGDC_ORG_SYNC_COOKIE`, en secondes. */
export const HGDC_ORG_SYNC_COOKIE_MAX_AGE = 60

/**
 * `frame=1` : relecture des organisations dans un cadre caché de la page (même origine). L'entrée
 * repasse par Account comme `refresh=1`, et le retour se fait sur `HGDC_FRAME_DONE_PATH`, une
 * réponse vide : jamais sur une page du produit, jamais sur un `next` reçu.
 */
export const HGDC_ENTRY_FRAME_PARAM = "frame"

/** Fin de la relecture en arrière-plan : réponse vide de l'entrée, sans appel à better-auth. */
export const HGDC_FRAME_DONE_PATH: string = `${HGDC_ENTRY_PATH}?${HGDC_ENTRY_FRAME_PARAM}=done`

/** Adresse du cadre caché qui relit les organisations (`frame=1`). */
export const HGDC_BACKGROUND_REFRESH_PATH: string = `${HGDC_ENTRY_PATH}?${HGDC_ENTRY_REFRESH_PARAM}=1&${HGDC_ENTRY_FRAME_PARAM}=1`

/** Option commune : le produit est servi sous un chemin (`/analytics`), voir `normalizeBasePath`. */
export type BasePathOptions = {
  /** Base de chemin du produit, `/analytics` par exemple. Absent ou `/` : le produit est à la racine. */
  basePath?: string | undefined
}

/**
 * Base de chemin d'un produit servi sous `https://<hôte>/<produit>`, normalisée : `""` (racine),
 * sinon `/segment` ou `/a/b`, sans barre finale. Lève sur tout ce qui n'est pas un chemin de
 * segments simples (lettres, chiffres, `.` `_` `~` `-`) : requête, fragment, espace, antislash,
 * `//`, `.` ou `..`, pourcentage. Une base se lit dans la configuration du produit, jamais dans
 * une requête.
 */
export function normalizeBasePath(value: string | null | undefined): string {
  if (value === undefined || value === null || value === "" || value === "/") return ""
  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value
  const segments = trimmed.split("/")
  const valid =
    segments[0] === "" &&
    segments.length > 1 &&
    segments.slice(1).every((segment) => /^[A-Za-z0-9._~-]+$/.test(segment) && segment !== "." && segment !== "..")
  if (!valid) throw new Error(`@hgdc/auth : basePath invalide (${JSON.stringify(value)}), attendu « /produit ».`)
  return trimmed
}

/** `path` (qui commence par `/`) sous la base : `withBasePath("/analytics", "/o/acme")` rend `/analytics/o/acme`. */
export function withBasePath(basePath: string | null | undefined, path: string): string {
  return `${normalizeBasePath(basePath)}${path}`
}

const NEXT_MAX_LENGTH = 2048
const NEXT_BASE = "https://next.invalid"

/**
 * Page d'arrivée sûre : un chemin du produit lui-même, jamais une autre origine. Refuse ce qu'un
 * navigateur lirait comme une adresse externe (`//hôte`, `/\hôte`, schéma), les caractères de
 * contrôle, et l'entrée ou `/api/auth` (boucle). Rend `fallback` dans tous ces cas.
 *
 * `options.basePath` (produit servi sous `/analytics`) : la valeur reste un chemin du produit, sans
 * la base ; l'entrée et `/api/auth` sont aussi refusés avec la base (`/analytics/auth/hgdc`,
 * `/analytics/api/auth`).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/", options: BasePathOptions = {}): string {
  const base = normalizeBasePath(options.basePath)
  if (typeof value !== "string" || value.length === 0 || value.length > NEXT_MAX_LENGTH) return fallback
  if (!value.startsWith("/") || value.startsWith("//")) return fallback
  // Les navigateurs lisent `\` comme `/` : `/\evil.ch` serait une adresse externe.
  // oxlint-disable-next-line no-control-regex -- refuser les caractères de contrôle est le but
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback
  let url: URL
  try {
    url = new URL(value, NEXT_BASE)
  } catch {
    return fallback
  }
  if (url.origin !== NEXT_BASE) return fallback
  const path = url.pathname.replace(/\/+$/, "") || "/"
  for (const prefix of base ? ["", base] : [""])
    if (
      path === `${prefix}${HGDC_ENTRY_PATH}` ||
      path === `${prefix}/api/auth` ||
      path.startsWith(`${prefix}/api/auth/`)
    )
      return fallback
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Adresse de l'entrée commune d'un produit : `hgdcEntryUrl("https://mail.hgdc.ch", "/o/acme")`.
 * Sans `next` (ou `next` refusé), le produit ouvre sa page d'accueil connectée. `refresh: true`
 * relit les organisations avant d'arriver (`refresh=1`) ; `refresh: "background"` arrive tout de
 * suite si la session du produit est ouverte et relit en arrière-plan (ADR 0016).
 *
 * Produit servi sous un chemin : `hgdcEntryUrl("https://app.hgdc.ch", "/o/acme", { basePath: "/analytics" })`
 * rend `https://app.hgdc.ch/analytics/auth/hgdc?next=/o/acme`. `next` reste un chemin du produit,
 * sans la base.
 */
export function hgdcEntryUrl(
  productOrigin: string,
  next?: string,
  options: { refresh?: boolean | typeof HGDC_ENTRY_REFRESH_BACKGROUND } & BasePathOptions = {},
): string {
  const base = normalizeBasePath(options.basePath)
  const url = new URL(`${base}${HGDC_ENTRY_PATH}`, new URL(productOrigin).origin)
  const path = next === undefined ? "/" : safeNextPath(next, "/", { basePath: base })
  if (options.refresh)
    url.searchParams.set(
      HGDC_ENTRY_REFRESH_PARAM,
      options.refresh === HGDC_ENTRY_REFRESH_BACKGROUND ? HGDC_ENTRY_REFRESH_BACKGROUND : "1",
    )
  if (path !== "/" || options.refresh) url.searchParams.set(HGDC_ENTRY_NEXT_PARAM, path)
  return url.toString()
}

/**
 * Chemin relatif qui relit les organisations puis revient sur `next` :
 * `/auth/hgdc?refresh=1&next=/o/acme`. Pour une page d'organisation inconnue du produit, avant
 * d'afficher « introuvable », si `hasSyncedMarker` est faux.
 *
 * Produit servi sous un chemin (`basePath`) : `/analytics/auth/hgdc?refresh=1&next=/o/acme`. `next`
 * est le chemin du routeur, sans la base.
 */
export function hgdcRefreshPath(next: string, options: BasePathOptions = {}): string {
  const base = normalizeBasePath(options.basePath)
  const params = new URLSearchParams({
    [HGDC_ENTRY_REFRESH_PARAM]: "1",
    [HGDC_ENTRY_NEXT_PARAM]: safeNextPath(withoutSyncedMarker(next), "/", { basePath: base }),
  })
  return `${base}${HGDC_ENTRY_PATH}?${params.toString()}`
}

function searchParamsOf(search: string | URLSearchParams): URLSearchParams {
  if (typeof search !== "string") return search
  const query = search.includes("?") ? search.slice(search.indexOf("?") + 1).split("#")[0] : search
  return new URLSearchParams(query)
}

/**
 * Vrai si la page arrive d'une resynchronisation (`?synced=1`) : ne pas relancer l'entrée.
 * Accepte une requête (`?a=1`), une adresse ou un chemin complet, ou des `URLSearchParams`.
 */
export function hasSyncedMarker(search: string | URLSearchParams): boolean {
  return searchParamsOf(search).get(HGDC_SYNCED_PARAM) === "1"
}

/** `path` sans le marqueur `synced`, le reste de la requête et le fragment gardés. */
export function withoutSyncedMarker(path: string): string {
  const hashAt = path.indexOf("#")
  const hash = hashAt === -1 ? "" : path.slice(hashAt)
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt)
  const queryAt = beforeHash.indexOf("?")
  if (queryAt === -1) return path
  const params = new URLSearchParams(beforeHash.slice(queryAt + 1))
  params.delete(HGDC_SYNCED_PARAM)
  const query = params.toString()
  return `${beforeHash.slice(0, queryAt)}${query ? `?${query}` : ""}${hash}`
}

/** `path` avec le marqueur `synced=1`, avant le fragment. */
export function withSyncedMarker(path: string): string {
  const clean = withoutSyncedMarker(path)
  const hashAt = clean.indexOf("#")
  const hash = hashAt === -1 ? "" : clean.slice(hashAt)
  const beforeHash = hashAt === -1 ? clean : clean.slice(0, hashAt)
  return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}${HGDC_SYNCED_PARAM}=1${hash}`
}

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
  /**
   * Émetteur attendu : `HGDC_ISSUER`, ou celui d'un Account de préproduction. L'émetteur de
   * production accepte ses deux noms (`acceptedIssuers`).
   */
  issuer: string | readonly string[]
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
 * - `iss` égal à l'émetteur attendu (ou à l'autre nom de l'émetteur de production, `acceptedIssuers`) ;
 * - `aud` contient `clientId`, et `azp` vaut `clientId` quand il y a plusieurs audiences ;
 * - `iat` de moins de `ID_TOKEN_MAX_AGE_SECONDS`, pas dans le futur, et `exp` non dépassé.
 *
 * La signature n'est pas revérifiée : le jeton vient du point de jeton d'Account, reçu par le
 * serveur en TLS (point 6). Le contrôle de fraîcheur empêche qu'un jeton ancien, que
 * better-auth n'aurait pas réécrit, rejoue des organisations périmées.
 *
 * `issuedAt` (`iat` en millisecondes) est l'instant où Account a lu les organisations : c'est lui,
 * pas l'heure de la copie, qui doit devenir le `syncedAt` des appartenances recopiées
 * (`accountEventIsStale` le compare aux événements poussés par Account).
 */
export function verifyHgdcIdToken(
  idToken: string,
  expected: IdTokenExpectation,
): { claims: Record<string, unknown>; organizations: HgdcOrganization[]; issuedAt: number } {
  const issuers = acceptedIssuers(expected.issuer)
  if (issuers.length === 0 || !expected.clientId)
    throw new Error("verifyHgdcIdToken : émetteur ou clientId attendu manquant (HGDC_CLIENT_ID ?).")
  const claims = payloadOf(idToken)

  const issuer = typeof claims.iss === "string" ? withoutTrailingSlash(claims.iss) : null
  if (issuer === null || !issuers.includes(issuer))
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
  return { claims, organizations: result.data.organizations ?? [], issuedAt: iat * 1000 }
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
 * Préfixe des cookies better-auth d'un produit (`hgdc-mail`) en cookie d'hôte : `__Host-hgdc-mail`.
 * Seule source du préfixe : la même valeur va à `convexBetterAuthReactStart({ cookiePrefix })`
 * côté front, sinon `getToken` ne trouve plus aucun jeton. Ordre de mise en place : l'edge accepte
 * d'abord `__Host-hgdc-` sur ses relais, puis Convex et le front du produit ensemble.
 */
export function hostCookiePrefix(prefix: string): string {
  if (!/^hgdc-[a-z]+$/.test(prefix))
    throw new Error(`hostCookiePrefix : préfixe invalide « ${prefix} », attendu « hgdc-<mot> ».`)
  return `__Host-${prefix}`
}

/**
 * Réglages `advanced` de better-auth pour des cookies `__Host-` (ADR 0014 de la famille) : `Secure`,
 * `Path=/`, sans `Domain`, garanti par le navigateur. Un nom voisin de `hgdc.ch` ne peut plus poser
 * un cookie du même nom pour tout le domaine (connexion forcée). better-auth n'ajoute `__Secure-`
 * que si `useSecureCookies` est vrai : on l'éteint et on remet `secure` sur chaque cookie.
 *
 * ```ts
 * advanced: { ...hgdcCookieOptions("hgdc-mail"), ipAddress: HGDC_IP_ADDRESS_OPTIONS }
 * ```
 */
export function hgdcCookieOptions(prefix: string): {
  cookiePrefix: string
  useSecureCookies: false
  defaultCookieAttributes: { secure: true; path: "/" }
} {
  return {
    cookiePrefix: hostCookiePrefix(prefix),
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, path: "/" },
  }
}

type CookieShape = { name: string; attributes: { domain?: string; path?: string; secure?: boolean } }

/**
 * Vérifie, au chargement de `convex/auth.ts`, que les cookies sont restés des cookies d'hôte :
 * un `defaultCookieAttributes` écrasé, `crossSubDomainCookies` ou un `advanced.cookies` les
 * défont, et le navigateur rejette alors le cookie sans rien dire (plus aucune connexion).
 *
 * ```ts
 * import { getCookies } from "better-auth/cookies"
 * assertHostCookies(getCookies(options))
 * ```
 */
export function assertHostCookies(cookies: Record<string, CookieShape>): void {
  for (const { name, attributes } of Object.values(cookies)) {
    const ok = name.startsWith("__Host-") && attributes.secure === true && attributes.path === "/" && !attributes.domain
    if (!ok)
      throw new Error(
        `assertHostCookies : « ${name} » n'est pas un cookie d'hôte (__Host-, Secure, Path=/, sans Domain).`,
      )
  }
}

/** Adresse publique d'une instance de better-auth : `baseURL`, `basePath` éventuel, origines de confiance. */
export type AuthSite = { baseURL: string; basePath?: string; trustedOrigins: string[] }

/**
 * Les deux instances de better-auth d'un produit servi sous `app.hgdc.ch/<mot>` (ADR 0014 de la
 * famille), côté Convex. Même base, même secret, mêmes JWKS : seules l'adresse de retour OAuth et
 * l'origine de confiance changent.
 *
 * - `app` : `SITE_URL` (`https://app.hgdc.ch`) ; sous une base, `baseURL` porte la base et `/api/auth`
 *   (Convex reçoit `/api/auth/*`, le produit remet la base avant better-auth).
 * - `solo` : `https://<mot>.hgdc.ch`, better-auth à `/<mot>/api/auth` (le proxy garde la base en vue
 *   seule, `createAuthProxy({ soloView: true })`). Origine constante, jamais tirée de la requête.
 *   `basePath` est toujours posé (`registerRoutes` le lit à l'analyse du module) ; sans base
 *   (développement), `soloEnabled` est faux, l'instance n'a ni adresse ni origine : la répondre 404.
 *
 * ```ts
 * const sites = viewAuthSites("mail", { siteUrl: process.env.SITE_URL, basePath: process.env.HGDC_BASE_PATH })
 * ```
 */
export function viewAuthSites(
  product: string,
  env: { siteUrl?: string | undefined; basePath?: string | undefined },
): { app: AuthSite; solo: AuthSite; soloEnabled: boolean } {
  if (!/^[a-z]+$/.test(product)) throw new Error(`viewAuthSites : produit invalide « ${product} ».`)
  const base = normalizeBasePath(env.basePath)
  const siteUrl = env.siteUrl ? new URL(env.siteUrl).origin : ""
  const app: AuthSite = {
    baseURL: siteUrl && base ? `${siteUrl}${base}/api/auth` : siteUrl,
    trustedOrigins: siteUrl ? [siteUrl] : [],
  }
  // Même règle que `soloOrigin` de `@hgdc/ui/addresses` (vérifié par les tests).
  const origin = `https://${product}.hgdc.ch`
  const basePath = `/${product}/api/auth`
  const soloEnabled = base === `/${product}`
  const solo: AuthSite = soloEnabled
    ? { baseURL: origin, basePath, trustedOrigins: [origin] }
    : { baseURL: "", basePath, trustedOrigins: [] }
  return { app, solo, soloEnabled }
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

/**
 * Durée pendant laquelle le navigateur reprend le jeton de session déjà lu plutôt que de le
 * redemander au serveur : 5 minutes. Le client Convex renouvelle lui-même son jeton ; celui-ci ne
 * sert qu'aux gardes de route et à amorcer le client.
 */
export const CLIENT_SESSION_TOKEN_TTL_MS: number = 5 * 60 * 1000

export type SessionTokenCache = {
  /** Jeton courant : au serveur, toujours relu ; au navigateur, repris s'il a moins de 5 minutes. */
  read: () => Promise<string | null>
  /** Amorce le cache avec le jeton du rendu serveur, à l'hydratation (la racine ne repasse pas par `read`). */
  seed: (token: string | null | undefined) => void
  /** Oublie le jeton (déconnexion sans rechargement). */
  clear: () => void
}

/**
 * Jeton de session pour le `beforeLoad` de la racine d'un produit TanStack Start. Sans cache, chaque
 * navigation côté navigateur rappelait le serveur (`getAuth`) avant tout rendu : l'ancienne page
 * restait figée le temps de l'aller-retour. Seule une session ouverte est gardée, jamais une absence
 * de session ; les appels simultanés partagent la même requête.
 *
 * ```ts
 * const session = createSessionTokenCache(() => getAuth())
 * beforeLoad: async ({ context }) => {
 *   const token = await session.read()
 *   …
 * }
 * // composant racine : useEffect(() => session.seed(context.token), [context.token])
 * ```
 */
export function createSessionTokenCache(
  fetchToken: () => Promise<string | null>,
  options: { ttlMs?: number; now?: () => number; isBrowser?: () => boolean } = {},
): SessionTokenCache {
  const ttl = options.ttlMs ?? CLIENT_SESSION_TOKEN_TTL_MS
  const now = options.now ?? Date.now
  const isBrowser = options.isBrowser ?? (() => typeof document !== "undefined")
  let cached: { token: string; at: number } | null = null
  let inflight: Promise<string | null> | null = null
  return {
    read: async () => {
      if (!isBrowser()) return await fetchToken()
      if (cached && now() - cached.at < ttl) return cached.token
      inflight ??= fetchToken()
        .then((token) => {
          cached = token ? { token, at: now() } : null
          return token
        })
        .finally(() => {
          inflight = null
        })
      return await inflight
    },
    seed: (token) => {
      if (isBrowser() && token && !cached) cached = { token, at: now() }
    },
    clear: () => {
      cached = null
    },
  }
}
