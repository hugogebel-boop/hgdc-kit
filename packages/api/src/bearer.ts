import { problem, problemResponse, type ProblemDetails } from "./errors.ts"

/*
 * Jeton porteur (RFC 6750) et métadonnées de ressource protégée (RFC 9728). Un 401 indique où lire
 * ces métadonnées (`WWW-Authenticate: Bearer resource_metadata="…"`) : un client MCP ou OAuth y
 * trouve le serveur d'autorisation (Account) et les scopes, sans configuration.
 */

const BEARER = /^Bearer +([A-Za-z0-9\-._~+/]+=*) *$/i

/** Le jeton de `Authorization: Bearer <jeton>`, sinon `null`. Accepte une requête, des en-têtes ou la valeur. */
export function extractBearer(source: Request | Headers | string | null | undefined): string | null {
  const value =
    source instanceof Request
      ? source.headers.get("authorization")
      : source instanceof Headers
        ? source.get("authorization")
        : source
  if (!value || value.length > 4096) return null
  return BEARER.exec(value)?.[1] ?? null
}

/**
 * Comparaison en temps constant de deux chaînes : la durée ne dépend que de la longueur de la plus
 * longue, jamais de la position du premier caractère différent. La longueur, elle, peut fuir :
 * comparer des empreintes de même taille (`safeEqualHash`) quand elle est secrète.
 */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  const length = Math.max(ea.length, eb.length)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < length; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

/** Comparaison des empreintes SHA-256 des deux chaînes : rien ne fuit, pas même la longueur. */
export async function safeEqualHash(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))
  const [da, db] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= da[i]! ^ db[i]!
  return diff === 0
}

/**
 * Un texte de défi `WWW-Authenticate` en ASCII imprimable : RFC 6750 § 3 limite `error_description`
 * et `scope` à %x20-21 / %x23-5B / %x5D-7E, et un en-tête HTTP hors ASCII est lu de travers (ou
 * refusé) par bien des clients. Accents retirés (« accès » devient « acces »), apostrophes et tirets
 * typographiques ramenés à `'` et `-`, guillemets, barres obliques inverses et autres caractères
 * écartés, espaces resserrés. Le message accentué reste dans le corps problem+json (`detail`).
 */
export function asciiChallengeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]|["\\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
}

function quote(value: string): string {
  return `"${asciiChallengeText(value)}"`
}

export type BearerError = "invalid_request" | "invalid_token" | "insufficient_scope"

export type ChallengeOptions = {
  /** Adresse du document de métadonnées (RFC 9728), voir `protectedResourceMetadataUrl`. */
  resourceMetadata?: string
  realm?: string
  /** Scopes nécessaires, séparés par des espaces (RFC 6750 § 3). */
  scope?: string
  error?: BearerError
  errorDescription?: string
}

/** Valeur de l'en-tête `WWW-Authenticate` d'un défi Bearer, toujours en ASCII (`asciiChallengeText`). */
export function wwwAuthenticate(options: ChallengeOptions = {}): string {
  const params: string[] = []
  if (options.realm) params.push(`realm=${quote(options.realm)}`)
  if (options.resourceMetadata) params.push(`resource_metadata=${quote(options.resourceMetadata)}`)
  if (options.scope) params.push(`scope=${quote(options.scope)}`)
  if (options.error) params.push(`error=${quote(options.error)}`)
  if (options.errorDescription) params.push(`error_description=${quote(options.errorDescription)}`)
  return params.length ? `Bearer ${params.join(", ")}` : "Bearer"
}

/**
 * La réponse d'un refus d'accès : 401 (jeton absent ou invalide) ou 403 (`insufficient_scope`),
 * en problem+json, avec le défi `WWW-Authenticate`. Sans jeton, pas de code `error` (RFC 6750 § 3.1).
 * Pour `insufficient_scope`, `scope` nomme le scope qui manque (`mail:write`). `detail` garde ses
 * accents ; `errorDescription` part en ASCII dans l'en-tête.
 */
export function unauthorized(options: ChallengeOptions & { detail?: string } = {}): Response {
  const slug =
    options.error === "insufficient_scope"
      ? "insufficient_scope"
      : options.error === "invalid_token"
        ? "invalid_token"
        : options.error === "invalid_request"
          ? "invalid_request"
          : "authentication_required"
  const body: ProblemDetails = problem(slug, options.detail === undefined ? {} : { detail: options.detail })
  return problemResponse(body, { "www-authenticate": wwwAuthenticate(options) })
}

/** Document de métadonnées de ressource protégée (RFC 9728 § 2). */
export type ProtectedResourceMetadata = {
  resource: string
  authorization_servers?: string[]
  jwks_uri?: string
  scopes_supported?: string[]
  bearer_methods_supported?: ("header" | "body" | "query")[]
  resource_signing_alg_values_supported?: string[]
  resource_name?: string
  resource_documentation?: string
  resource_policy_uri?: string
  resource_tos_uri?: string
  [member: string]: unknown
}

/**
 * Le document, avec les valeurs de la famille : jeton dans l'en-tête seulement. `resource` est
 * l'identifiant canonique de la ressource (RFC 8707) : schéma et hôte en minuscules, sans
 * fragment ni barre finale (`https://app.hgdc.ch/mail/mcp`).
 */
export function protectedResourceMetadata(options: {
  resource: string
  authorizationServers: string[]
  scopesSupported?: string[]
  resourceName?: string
  resourceDocumentation?: string
  extra?: Record<string, unknown>
}): ProtectedResourceMetadata {
  return {
    ...options.extra,
    resource: canonicalResource(options.resource),
    authorization_servers: options.authorizationServers,
    bearer_methods_supported: ["header"],
    ...(options.scopesSupported && { scopes_supported: options.scopesSupported }),
    ...(options.resourceName && { resource_name: options.resourceName }),
    ...(options.resourceDocumentation && { resource_documentation: options.resourceDocumentation }),
  }
}

/** Identifiant canonique d'une ressource (RFC 8707 et spécification MCP) : sans fragment ni barre finale. */
export function canonicalResource(resource: string): string {
  const url = new URL(resource)
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(`Ressource sans HTTPS : ${resource}`)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`
}

/**
 * Adresse du document pour une ressource (RFC 9728 § 3.1) : `/.well-known/oauth-protected-resource`
 * s'insère entre l'hôte et le chemin. `https://app.hgdc.ch/mail/mcp` donne
 * `https://app.hgdc.ch/.well-known/oauth-protected-resource/mail/mcp`.
 */
export function protectedResourceMetadataUrl(resource: string): string {
  const url = new URL(canonicalResource(resource))
  const path = url.pathname === "/" ? "" : url.pathname
  return `${url.origin}/.well-known/oauth-protected-resource${path}${url.search}`
}

/** La réponse du document : JSON public, lisible depuis un navigateur, en cache une heure. */
export function protectedResourceMetadataResponse(metadata: ProtectedResourceMetadata): Response {
  return new Response(JSON.stringify(metadata), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  })
}
