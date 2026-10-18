/*
 * Le modèle de l'assistant, ses tarifs et les crédits. Claude est appelé chez Anthropic ou par
 * OpenRouter (même modèle, API au format Anthropic), selon le préfixe de la clé. Fonctions pures.
 */

export type Provider = "anthropic" | "openrouter"

/** Clé Anthropic (`sk-ant-`) ou OpenRouter (`sk-or-`), reconnue à son préfixe ; `null` sinon. */
export function keyProvider(key: string): Provider | null {
  if (/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return "anthropic"
  if (/^sk-or-[A-Za-z0-9_-]{20,}$/.test(key)) return "openrouter"
  return null
}

/** Une clé de plateforme lue dans l'environnement, si elle est posée et reconnue. */
export function readKey(value: string | undefined): string | undefined {
  const key = value?.trim()
  return key && keyProvider(key) ? key : undefined
}

/** Tarif en dollars par million de jetons (la réflexion compte comme sortie). */
export type Price = {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  /** Au-delà de `threshold` jetons d'entrée dans une requête, ce tarif s'applique à toute la requête. */
  long?: { threshold: number; input: number; cacheWrite: number; cacheRead: number; output: number }
}

export type Model = {
  /** Identifiant chez Anthropic. */
  anthropic: string
  /** Le même modèle chez OpenRouter. */
  openrouter: string
  price: Price
}

/**
 * Claude Haiku 5.5, le modèle par défaut de l'assistant des produits : 0,10 $ et 0,50 $ par
 * million de jetons jusqu'à 100 000 jetons d'entrée, 0,50 $ et 2,50 $ au-delà. Cache écrit à
 * 1,25 fois et lu à 0,1 fois le prix d'entrée.
 */
export const HAIKU_5_5: Model = {
  anthropic: "claude-haiku-5-5",
  openrouter: "anthropic/claude-haiku-5.5",
  price: {
    input: 0.1,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    output: 0.5,
    long: { threshold: 100_000, input: 0.5, cacheWrite: 0.625, cacheRead: 0.05, output: 2.5 },
  },
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api"

export type Usage = { input: number; cacheWrite: number; cacheRead: number; output: number }

export const NO_USAGE: Usage = Object.freeze({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0 })

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
  }
}

/** Coût d'une requête en dollars, palier long compris. */
export function requestCost(usage: Usage, price: Price): number {
  const totalInput = usage.input + usage.cacheWrite + usage.cacheRead
  const rate = price.long && totalInput > price.long.threshold ? price.long : price
  return (
    (usage.input * rate.input +
      usage.cacheWrite * rate.cacheWrite +
      usage.cacheRead * rate.cacheRead +
      usage.output * rate.output) /
    1_000_000
  )
}

/**
 * Coût d'une requête en micro-dollars entiers, arrondi au-dessus : les tours se cumulent sans
 * perte (un tour à 0,0004 $ compte 400, pas 0). Un prix en dollars par million de jetons, fois un
 * nombre de jetons, donne directement des micro-dollars.
 */
export function requestMicros(usage: Usage, price: Price): number {
  return Math.ceil(requestCost(usage, price) * 1_000_000)
}

/** 1 crédit = 1 centime de dollar = 10 000 micro-dollars. */
export const MICROS_PER_CREDIT = 10_000

/** Crédits affichés pour un cumul en micro-dollars, au dixième. La conversion n'a lieu qu'à l'affichage. */
export function creditsFromMicros(micros: number): number {
  return Math.round((micros / MICROS_PER_CREDIT) * 10) / 10
}

export function microsFromCredits(credits: number): number {
  return Math.round(credits * MICROS_PER_CREDIT)
}

/** Le mois civil UTC, `2026-10` : la clé d'une ligne de consommation. */
export function currentMonth(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7)
}

export type Availability = "ready" | "not_configured" | "exhausted"

/**
 * Peut-on lancer une réponse ? Avec la clé de l'organisation, les crédits ne comptent pas ;
 * sinon il faut la clé de la plateforme et des crédits restants.
 */
export function availability(state: {
  ownKey: boolean
  platformKey: boolean
  used: number
  limit: number
}): Availability {
  if (state.ownKey) return "ready"
  if (!state.platformKey) return "not_configured"
  return state.used >= state.limit ? "exhausted" : "ready"
}
