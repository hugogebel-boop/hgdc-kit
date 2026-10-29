import { dialectResponse, problem, type Dialect } from "./errors.ts"

/*
 * Limites de débit des API publiques. Les préréglages ont la forme de la configuration du
 * composant `@convex-dev/rate-limiter` (`new RateLimiter(components.rateLimiter, { ...API_RATE_LIMITS })`),
 * sans en dépendre. Les en-têtes suivent draft-ietf-httpapi-ratelimit-headers-11
 * (`RateLimit-Policy`, `RateLimit`) et `Retry-After` (RFC 9110).
 */

export const SECOND = 1000
export const MINUTE: number = 60 * SECOND
export const HOUR: number = 60 * MINUTE

/** Configuration d'une limite, compatible avec celle de `@convex-dev/rate-limiter` 0.4. */
export type RateLimitConfig = {
  kind: "token bucket" | "fixed window"
  /** Jetons ajoutés par `period`. */
  rate: number
  /** Durée en millisecondes. */
  period: number
  /** Jetons cumulables au plus (rafale) ; `rate` par défaut. */
  capacity?: number
  maxReserved?: number
  shards?: number
}

/**
 * Préréglages communs. Clé de la limite : l'identifiant de la clé d'API (`apiKey*`, `mcp`), l'IP
 * (`ip*`), ou l'IP pour les échecs d'authentification (`authFailure`, à consommer seulement
 * quand l'accès est refusé).
 */
export type RateLimitPreset = "apiKeyRead" | "apiKeyWrite" | "mcp" | "ipAnonymous" | "authFailure"

export const API_RATE_LIMITS: Readonly<Record<RateLimitPreset, RateLimitConfig>> = {
  /** Lecture par clé : 600 par minute, rafale de 120. */
  apiKeyRead: { kind: "token bucket", rate: 600, period: MINUTE, capacity: 120 },
  /** Écriture par clé : 120 par minute, rafale de 30. */
  apiKeyWrite: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 30 },
  /** Appels d'outils MCP par clé ou par jeton : 120 par minute, rafale de 30. */
  mcp: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 30 },
  /** Requêtes sans clé, par IP : 60 par minute, rafale de 20. */
  ipAnonymous: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  /** Échecs d'authentification par IP : 20 par tranche de 10 minutes. */
  authFailure: { kind: "fixed window", rate: 20, period: 10 * MINUTE },
}

const POLICY_NAME = /^[a-z][a-z0-9_-]{0,63}$/

function assertPolicy(name: string): void {
  if (!POLICY_NAME.test(name)) throw new Error(`Nom de politique invalide : ${name}`)
}

/** Quota et fenêtre (secondes) annoncés pour une configuration. */
export function policyOf(config: RateLimitConfig): { quota: number; windowSeconds: number } {
  return { quota: config.capacity ?? config.rate, windowSeconds: Math.max(1, Math.round(config.period / SECOND)) }
}

/** `Retry-After` en secondes entières, arrondi au-dessus, 1 au moins. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / SECOND))
}

export type RateLimitState = {
  /** Nom de la politique : `apiKeyRead` devient `apikeyread` (jeton en minuscules). */
  policy: string
  config: RateLimitConfig
  /** Jetons restants ; inconnu si le produit n'a fait que `limit()`. */
  remaining?: number
  /** Millisecondes avant de pouvoir réessayer ou avant la remise à plein. */
  resetMs?: number
}

/** Les en-têtes `RateLimit-Policy` et `RateLimit` d'une réponse. */
export function rateLimitHeaders(state: RateLimitState): Record<string, string> {
  const name = state.policy.toLowerCase()
  assertPolicy(name)
  const { quota, windowSeconds } = policyOf(state.config)
  const headers: Record<string, string> = { "RateLimit-Policy": `"${name}";q=${quota};w=${windowSeconds}` }
  if (state.remaining !== undefined) {
    const r = Math.max(0, Math.floor(state.remaining))
    const t = state.resetMs === undefined ? "" : `;t=${Math.max(0, Math.ceil(state.resetMs / SECOND))}`
    headers.RateLimit = `"${name}";r=${r}${t}`
  }
  return headers
}

/**
 * La réponse 429 d'une limite atteinte (`{ ok: false, retryAfter }` du composant) : problème
 * `rate_limited` dans le dialecte de la route, `Retry-After` et en-têtes RateLimit.
 */
export function rateLimitedResponse(options: {
  policy: string
  config: RateLimitConfig
  retryAfterMs: number
  dialect?: Dialect
}): Response {
  const seconds = retryAfterSeconds(options.retryAfterMs)
  const headers = {
    ...rateLimitHeaders({
      policy: options.policy,
      config: options.config,
      remaining: 0,
      resetMs: options.retryAfterMs,
    }),
    "Retry-After": String(seconds),
  }
  const body = problem("rate_limited", {
    detail: `Limite atteinte. Réessayer dans ${seconds} s.`,
    extensions: { retry_after: seconds },
  })
  return dialectResponse(body, options.dialect ?? "problem", headers)
}

/**
 * L'IP du client derrière des mandataires de confiance. `X-Forwarded-For` se lit de droite à
 * gauche : l'entrée de gauche est écrite par le client et ne vaut rien. `trustedHops` = nombre de
 * mandataires de confiance qui ajoutent chacun une entrée (1 derrière un seul Caddy). `null` si
 * l'en-tête manque ou est trop court.
 */
export function clientIp(
  headers: Headers,
  { header = "x-forwarded-for", trustedHops = 1 }: { header?: string; trustedHops?: number } = {},
): string | null {
  const entries = (headers.get(header) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const ip = entries[entries.length - trustedHops]
  return ip && /^[0-9A-Fa-f:.]{2,45}$/.test(ip) ? ip : null
}
