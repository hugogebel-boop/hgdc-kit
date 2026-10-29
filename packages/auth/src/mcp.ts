import { HGDC_ISSUER } from "./index.ts"

/*
 * Serveurs MCP des produits, autorisés par Account (OAuth 2.1, spécification MCP 2026-07-28).
 *
 * Account est le serveur d'autorisation de la famille. Un client MCP (Claude, ChatGPT, un éditeur)
 * s'y enregistre, la personne consent pour une organisation, et Account émet un jeton d'accès JWT
 * signé RS256 par ses clés (`/api/auth/jwks`) :
 *
 *   iss    = HGDC_ISSUER
 *   aud    = l'adresse du serveur MCP du produit (`mcpResource`), envoyée par le client (RFC 8707)
 *   azp    = le client MCP
 *   sub    = la personne (id Account)
 *   scope  = `<produit>:read`, `<produit>:write`, `offline_access`
 *   org_id = l'organisation choisie à l'écran de consentement
 *
 * Chaque produit vérifie ce jeton lui-même (`verifyMcpAccessToken`), sans appeler Account. Deux
 * conditions, toujours ensemble : l'audience est la sienne ET un scope est le sien. better-auth 1.6
 * ne lie pas l'audience à l'autorisation (GHSA-p2fr-6hmx-4528) : un client peut demander un jeton
 * pour une autre adresse de la liste. Le scope, lui, est celui que la personne a accepté ; un jeton
 * changé d'audience ne porte donc jamais le scope du produit visé, sauf si la personne l'a accordé.
 * Une seule de ces deux conditions ne suffit pas (jeton d'un autre produit, « confused deputy »).
 *
 * Cette liste est la seule déclaration des produits et de leurs scopes : Account en tire les
 * audiences acceptées et les libellés du consentement, chaque produit son document RFC 9728.
 */

/** Produits qui servent un MCP protégé par Account, en minuscules. */
export const MCP_PRODUCTS = ["account", "analytics", "docs", "host", "iassistant", "mail", "portal", "status"] as const

export type McpProduct = (typeof MCP_PRODUCTS)[number]

/** Droits qu'Account accorde à un client MCP : lire, ou lire et écrire. `admin` reste aux clés d'API. */
export const MCP_RIGHTS = ["read", "write"] as const

export type McpRight = (typeof MCP_RIGHTS)[number]

/** Clés publiques d'Account, celles qui signent les jetons d'accès. */
export const HGDC_JWKS_URL: string = `${HGDC_ISSUER}/jwks`

/** Claim du jeton qui porte l'organisation choisie à l'écran de consentement. */
export const MCP_ORGANIZATION_CLAIM = "org_id" as const

/**
 * Durée de vie d'un jeton d'accès MCP : 15 minutes. Un jeton signé ne se rappelle pas ; une
 * révocation dans Account (« Applications connectées ») coupe le renouvellement tout de suite et
 * l'accès au plus tard à l'échéance du dernier jeton émis.
 */
export const MCP_ACCESS_TOKEN_TTL_SECONDS: number = 15 * 60

export function isMcpProduct(value: string): value is McpProduct {
  return (MCP_PRODUCTS as readonly string[]).includes(value)
}

/**
 * Adresse canonique du serveur MCP d'un produit (RFC 8707, sans barre finale) : l'audience de ses
 * jetons. Les produits sont servis sous `https://app.hgdc.ch/<produit>` (ADR 0005 du dépôt `hgdc`) ;
 * Account garde son domaine.
 */
export function mcpResource(product: McpProduct): string {
  if (!isMcpProduct(product)) throw new Error(`@hgdc/auth : produit MCP inconnu (${JSON.stringify(product)}).`)
  return product === "account" ? "https://account.hgdc.ch/mcp" : `https://app.hgdc.ch/${product}/mcp`
}

/** Les adresses de tous les serveurs MCP : les audiences qu'Account accepte. */
export const MCP_RESOURCES: readonly string[] = MCP_PRODUCTS.map(mcpResource)

/** `<produit>:read` et `<produit>:write`, dans cet ordre. */
export function mcpScopes(product: McpProduct): [string, string] {
  if (!isMcpProduct(product)) throw new Error(`@hgdc/auth : produit MCP inconnu (${JSON.stringify(product)}).`)
  return [`${product}:read`, `${product}:write`]
}

/** Tous les scopes de produit qu'un client MCP peut recevoir. */
export const MCP_SCOPES: readonly string[] = MCP_PRODUCTS.flatMap(mcpScopes)

/** `portal:write` donne `{ product: "portal", right: "write" }` ; tout autre texte `null`. */
export function parseMcpScope(scope: string): { product: McpProduct; right: McpRight } | null {
  const [product, right, ...rest] = scope.split(":")
  if (rest.length > 0 || product === undefined || right === undefined) return null
  if (!isMcpProduct(product) || !(MCP_RIGHTS as readonly string[]).includes(right)) return null
  return { product, right: right as McpRight }
}

export function isMcpScope(scope: string): boolean {
  return parseMcpScope(scope) !== null
}

/**
 * Document de métadonnées de ressource protégée (RFC 9728) du MCP d'un produit, à servir à
 * `protectedResourceMetadataUrl(mcpResource(produit))` (`@hgdc/api/bearer`, qui fournit aussi la
 * réponse HTTP et le défi `WWW-Authenticate`). Le client y lit le serveur d'autorisation et les scopes.
 */
export function mcpProtectedResourceMetadata(
  product: McpProduct,
  options: { resourceName?: string; resourceDocumentation?: string } = {},
): {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  bearer_methods_supported: ["header"]
  resource_signing_alg_values_supported: ["RS256"]
  resource_name?: string
  resource_documentation?: string
} {
  return {
    resource: mcpResource(product),
    authorization_servers: [HGDC_ISSUER],
    scopes_supported: [...mcpScopes(product), "offline_access"],
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["RS256"],
    ...(options.resourceName && { resource_name: options.resourceName }),
    ...(options.resourceDocumentation && { resource_documentation: options.resourceDocumentation }),
  }
}

/** Pourquoi un jeton est refusé, pour les journaux. Le client ne reçoit que `bearerError`. */
export type McpTokenRejection =
  | "malformed"
  | "unsupported_algorithm"
  | "unknown_key"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "not_yet_valid"
  | "invalid_claims"
  | "insufficient_scope"

/** Erreur de `verifyMcpAccessToken`. `bearerError` va dans le défi `WWW-Authenticate` (401 ou 403). */
export class McpTokenError extends Error {
  readonly reason: McpTokenRejection
  readonly bearerError: "invalid_token" | "insufficient_scope"
  /** Le scope qui manque (`mail:read`, `mail:write`) quand `bearerError` vaut `insufficient_scope`. */
  readonly scope: string | undefined
  constructor(reason: McpTokenRejection, message: string, scope?: string) {
    super(message)
    this.name = "McpTokenError"
    this.reason = reason
    this.bearerError = reason === "insufficient_scope" ? "insufficient_scope" : "invalid_token"
    this.scope = reason === "insufficient_scope" ? scope : undefined
  }
}

/**
 * Le défi Bearer d'un jeton refusé, à étaler dans `unauthorized()` de `@hgdc/api/bearer` :
 * - jeton invalide : `{ error: "invalid_token" }`, réponse 401 ;
 * - jeton valide sans le scope demandé : `{ error: "insufficient_scope", scope: "<produit>:read" }`
 *   (ou `:write`), réponse 403 (RFC 6750 § 3.1, autorisation MCP « step-up »). Le client sait qu'il
 *   doit redemander ce scope, pas un nouveau jeton.
 *
 * ```ts
 * catch (error) {
 *   if (error instanceof McpTokenError) return unauthorized({ ...challenge, ...mcpTokenChallenge(error) })
 * }
 * ```
 */
export function mcpTokenChallenge(
  error: McpTokenError,
): { error: "invalid_token" } | { error: "insufficient_scope"; scope?: string } {
  if (error.bearerError !== "insufficient_scope") return { error: "invalid_token" }
  return error.scope ? { error: "insufficient_scope", scope: error.scope } : { error: "insufficient_scope" }
}

/** Ce qu'un jeton vérifié autorise, pour ce produit seulement. */
export type McpAccess = {
  product: McpProduct
  /** La personne (id Account). */
  userId: string
  /** Le client MCP (`azp`). */
  clientId: string
  /** L'organisation choisie au consentement. Le produit vérifie encore que la personne en est membre. */
  organizationId: string | null
  /** Les scopes de ce produit, sans ceux d'autres produits. */
  scopes: string[]
  canWrite: boolean
  /** Échéance du jeton, en millisecondes. */
  expiresAt: number
}

/** Clé publique d'Account par son `kid`, `null` si inconnue. Voir `createHgdcJwks`. */
export type McpKeyLookup = (kid: string) => Promise<JsonWebKey | null>

export type VerifyMcpAccessTokenOptions = {
  product: McpProduct
  /** Les clés d'Account : un jeu fixe (`{ keys }`) ou une recherche par `kid` (`createHgdcJwks`). */
  keys: { keys: readonly JsonWebKey[] } | McpKeyLookup
  /** Droit nécessaire pour l'appel : `write` refuse un jeton de lecture seule (403). Par défaut `read`. */
  require?: McpRight
  /** Émetteur attendu, `HGDC_ISSUER` par défaut (un Account d'essai en a un autre). */
  issuer?: string
  /** Audience attendue, `mcpResource(product)` par défaut (un produit d'essai en a une autre). */
  resource?: string
  /** `false` pour un MCP sans organisation (Account). Par défaut, un jeton sans `org_id` est refusé. */
  requireOrganization?: boolean
  /** Instant présent en millisecondes, `Date.now()` par défaut. */
  now?: number
}

const MAX_TOKEN_LENGTH = 8192
const CLOCK_SKEW_SECONDS = 60
/** Au-delà, le jeton ne vient pas d'Account tel que configuré : refusé même bien signé. */
const MAX_LIFETIME_SECONDS = 60 * 60
const MIN_RSA_MODULUS_BYTES = 256

function reject(reason: McpTokenRejection, message: string, scope?: string): never {
  throw new McpTokenError(reason, message, scope)
}

function decodeSegment(segment: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) reject("malformed", "Jeton illisible.")
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/")
  try {
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0))
  } catch {
    return reject("malformed", "Jeton illisible.")
  }
}

function decodeJson(segment: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeSegment(segment)))
  } catch (error) {
    if (error instanceof McpTokenError) throw error
    reject("malformed", "Jeton illisible.")
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) reject("malformed", "Jeton illisible.")
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512
}

async function findKey(keys: VerifyMcpAccessTokenOptions["keys"], kid: string): Promise<JsonWebKey | null> {
  if (typeof keys === "function") return await keys(kid)
  return keys.keys.find((key) => (key as { kid?: unknown }).kid === kid) ?? null
}

async function importRsaKey(jwk: JsonWebKey): Promise<CryptoKey> {
  // Clé RSA de signature RS256 seulement : une clé d'un autre type ou d'un autre usage ne sert jamais.
  if (jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string")
    reject("unknown_key", "Clé de signature inconnue.")
  if (jwk.alg !== undefined && jwk.alg !== "RS256") reject("unknown_key", "Clé de signature inconnue.")
  if (jwk.use !== undefined && jwk.use !== "sig") reject("unknown_key", "Clé de signature inconnue.")
  if (decodeSegment(jwk.n).length < MIN_RSA_MODULUS_BYTES) reject("unknown_key", "Clé de signature trop courte.")
  try {
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    )
  } catch {
    return reject("unknown_key", "Clé de signature illisible.")
  }
}

/**
 * Vérifie un jeton d'accès MCP émis par Account pour ce produit, sans appeler Account :
 * - signature RS256 par une clé d'Account (aucun autre algorithme, `none` compris) ;
 * - `iss` exact, `aud` égal à l'adresse MCP du produit (rien d'autre dans `aud`) ;
 * - `exp`, `iat`, `nbf` (une minute de tolérance), durée de vie d'au plus une heure ;
 * - `sub`, `azp` présents, `org_id` présent sauf `requireOrganization: false` ;
 * - au moins un scope du produit, et `write` si `require: "write"` (sinon 403 `insufficient_scope`).
 *
 * Un id_token ou un JWT Convex d'Account, signés par la même clé, sont refusés : leur audience est
 * un client ou `convex`, jamais une adresse MCP. Lève `McpTokenError` ; ne jamais renvoyer son
 * message au client, seulement `bearerError`.
 */
export async function verifyMcpAccessToken(token: string, options: VerifyMcpAccessTokenOptions): Promise<McpAccess> {
  const { product } = options
  if (!isMcpProduct(product)) throw new Error(`@hgdc/auth : produit MCP inconnu (${JSON.stringify(product)}).`)
  const issuer = options.issuer ?? HGDC_ISSUER
  const resource = options.resource ?? mcpResource(product)
  const now = Math.floor((options.now ?? Date.now()) / 1000)

  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) reject("malformed", "Jeton illisible.")
  const parts = token.split(".")
  if (parts.length !== 3) reject("malformed", "Jeton illisible.")
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]

  const header = decodeJson(headerPart)
  if (header.alg !== "RS256") reject("unsupported_algorithm", "Algorithme de signature refusé.")
  if (header.crit !== undefined) reject("unsupported_algorithm", "En-tête critique non pris en charge.")
  if (!nonEmptyString(header.kid)) reject("unknown_key", "Clé de signature inconnue.")

  const jwk = await findKey(options.keys, header.kid)
  if (!jwk) reject("unknown_key", "Clé de signature inconnue.")
  const key = await importRsaKey(jwk)
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeSegment(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  )
  if (!valid) reject("bad_signature", "Signature invalide.")

  const claims = decodeJson(payloadPart)
  if (claims.iss !== issuer) reject("wrong_issuer", "Jeton d'un autre émetteur.")
  const audience = Array.isArray(claims.aud) && claims.aud.length === 1 ? claims.aud[0] : claims.aud
  if (audience !== resource) reject("wrong_audience", "Jeton destiné à une autre ressource.")

  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") reject("invalid_claims", "Échéance absente.")
  if (now >= claims.exp + CLOCK_SKEW_SECONDS) reject("expired", "Jeton expiré.")
  if (claims.iat > now + CLOCK_SKEW_SECONDS) reject("not_yet_valid", "Jeton émis dans le futur.")
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > now + CLOCK_SKEW_SECONDS))
    reject("not_yet_valid", "Jeton pas encore valable.")
  if (claims.exp - claims.iat > MAX_LIFETIME_SECONDS) reject("invalid_claims", "Durée de vie trop longue.")

  if (!nonEmptyString(claims.sub) || !nonEmptyString(claims.azp)) reject("invalid_claims", "Personne ou client absent.")
  if (claims.client_id !== undefined && claims.client_id !== claims.azp) reject("invalid_claims", "Client incohérent.")
  const organization = claims[MCP_ORGANIZATION_CLAIM]
  if (organization !== undefined && !nonEmptyString(organization)) reject("invalid_claims", "Organisation illisible.")
  if ((options.requireOrganization ?? true) && organization === undefined)
    reject("invalid_claims", "Aucune organisation choisie.")

  const required = `${product}:${options.require ?? "read"}`
  if (typeof claims.scope !== "string") reject("insufficient_scope", "Aucun scope.", required)
  const scopes = [
    ...new Set(claims.scope.split(" ").filter((scope) => parseMcpScope(scope)?.product === product)),
  ].toSorted()
  if (scopes.length === 0) reject("insufficient_scope", `Aucun scope ${product}.`, required)
  const canWrite = scopes.includes(`${product}:write`)
  if ((options.require ?? "read") === "write" && !canWrite)
    reject("insufficient_scope", `Scope ${product}:write requis.`, required)

  return {
    product,
    userId: claims.sub,
    clientId: claims.azp,
    organizationId: (organization as string | undefined) ?? null,
    scopes,
    canWrite,
    expiresAt: claims.exp * 1000,
  }
}

/** Délai de lecture des clés d'Account. */
const JWKS_TIMEOUT_MS = 3000

/**
 * Clés d'Account lues à `HGDC_JWKS_URL`, gardées en mémoire `ttlMs` (10 minutes). Un `kid` inconnu
 * relit la liste, au plus une fois par `minRefreshMs` (une minute) : une rotation de clé passe sans
 * attendre, un jeton forgé avec un `kid` au hasard ne fait pas tomber Account. Une erreur réseau
 * garde les clés déjà lues. À créer une fois par module (portée du fichier), pas par requête.
 */
export function createHgdcJwks(
  options: {
    url?: string
    fetch?: typeof fetch
    ttlMs?: number
    minRefreshMs?: number
    now?: () => number
  } = {},
): McpKeyLookup {
  const url = options.url ?? HGDC_JWKS_URL
  const fetchImpl = options.fetch ?? fetch
  const ttlMs = options.ttlMs ?? 10 * 60_000
  const minRefreshMs = options.minRefreshMs ?? 60_000
  const now = options.now ?? Date.now
  let keys: JsonWebKey[] = []
  let loadedAt = Number.NEGATIVE_INFINITY
  let attemptedAt = Number.NEGATIVE_INFINITY

  async function refresh(): Promise<void> {
    attemptedAt = now()
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        // Account lent ou détourné : ne pas faire attendre chaque requête du produit, ni suivre ailleurs.
        redirect: "error",
        signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
      })
      if (!response.ok) return
      const body = (await response.json()) as { keys?: unknown }
      if (!Array.isArray(body.keys)) return
      keys = body.keys.filter((key): key is JsonWebKey => typeof key === "object" && key !== null)
      loadedAt = now()
    } catch {
      // Account injoignable : les clés déjà lues restent valables.
    }
  }

  const find = (kid: string) => keys.find((key) => (key as { kid?: unknown }).kid === kid) ?? null

  return async (kid) => {
    if (now() - loadedAt > ttlMs && now() - attemptedAt >= minRefreshMs) await refresh()
    const known = find(kid)
    if (known || now() - attemptedAt < minRefreshMs) return known
    await refresh()
    return find(kid)
  }
}
