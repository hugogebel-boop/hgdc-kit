import type { DocsConfig } from "../core/config.ts"

/**
 * Champs de docs.json lus par nos composants (`virtual:hgdc-docs/config`) et nulle part
 * ailleurs : un changement se voit après un simple rechargement de la page. Les autres
 * (navigation, redirections, sous-chemin, langue, favicon…) passent par la configuration
 * de Starlight ou d'Astro et demandent un redémarrage du serveur (ADR 0011).
 *
 * `name` et `description` sont aussi le titre et la description de Starlight (balise
 * `<title>`, métadonnées) : l'en-tête et le pied suivent tout de suite, l'onglet du
 * navigateur au prochain redémarrage.
 */
export const LIVE_FIELDS = ["colors", "logo", "navbar", "footer", "name", "description", "assistant", "app"] as const

function withoutLive(config: DocsConfig): string {
  const rest: Record<string, unknown> = { ...config }
  for (const field of LIVE_FIELDS) delete rest[field]
  return JSON.stringify(rest)
}

/** Vrai si le passage de `before` à `after` touche autre chose que l'apparence. */
export function needsRestart(before: DocsConfig, after: DocsConfig): boolean {
  return withoutLive(before) !== withoutLive(after)
}
