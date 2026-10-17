/*
 * Calendrier de reprises d'une livraison (celui de Svix, resserré) : un premier essai tout de
 * suite, puis ces délais. La file elle-même (planificateur, tables) reste dans chaque produit.
 */

/** Délais en ms avant chaque reprise : 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h. */
export const RETRY_DELAYS_MS: readonly number[] = [
  5_000, 300_000, 1_800_000, 7_200_000, 18_000_000, 36_000_000, 36_000_000,
]

/** Essais au total, le premier compris. */
export const MAX_ATTEMPTS: number = RETRY_DELAYS_MS.length + 1

/** Délai d'une réponse de l'endpoint : au-delà, l'essai est un échec. */
export const DELIVERY_TIMEOUT_MS = 10_000

/** Délai avant l'essai suivant, après `failedAttempts` essais ratés ; `null` : on abandonne. */
export function retryDelay(failedAttempts: number): number | null {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 1) return null
  return RETRY_DELAYS_MS[failedAttempts - 1] ?? null
}

/** Une réponse HTTP vaut-elle succès ? 2xx seulement : une redirection n'est jamais suivie. */
export function isDelivered(status: number): boolean {
  return status >= 200 && status < 300
}
