import type { ToolKind, ToolSpec } from "./tools.ts"

/*
 * La garde « trifecta » d'un tour (Simon Willison, « The lethal trifecta », 2025) : données
 * privées, contenu non fiable et envoi vers l'extérieur dans un même tour permettent d'exfiltrer.
 * Le tour suit ce qu'il a lu (`private`, `untrusted` sur l'outil) ; un outil `send` ne s'exécute
 * jamais pendant le tour (carte à confirmer) et, après les deux, sa carte porte une mise en garde
 * ou l'appel est refusé (`policy: "block"`). Fonctions pures, testées à part.
 */

/** Ce que le tour a lu jusqu'ici. */
export type Taint = Readonly<{ private: boolean; untrusted: boolean }>

export const CLEAN: Taint = Object.freeze({ private: false, untrusted: false })

/** `confirm` : carte avec mise en garde (défaut) ; `block` : l'envoi est refusé pour ce tour. */
export type TrifectaPolicy = "confirm" | "block"

/** Le chemin d'un appel : gestionnaire de lecture, d'écriture, carte, ou refus. */
export type Route = "read" | "write" | "propose" | "refuse"

/** L'état du tour après un appel réussi de cet outil. */
export function taintAfter(taint: Taint, tool: Pick<ToolSpec, "private" | "untrusted">): Taint {
  if ((!tool.private || taint.private) && (!tool.untrusted || taint.untrusted)) return taint
  return { private: taint.private || tool.private === true, untrusted: taint.untrusted || tool.untrusted === true }
}

/** Le tour a lu des données privées et du contenu non fiable : un envoi pourrait les faire sortir. */
export function isTrifecta(taint: Taint): boolean {
  return taint.private && taint.untrusted
}

/**
 * Où va un appel. `confirm` et `send` passent toujours par une carte, quel que soit l'état du
 * tour ; `send` est refusé après la trifecta si la politique est `block`.
 */
export function routeCall(kind: ToolKind, taint: Taint, policy: TrifectaPolicy = "confirm"): Route {
  switch (kind) {
    case "read":
      return "read"
    case "write":
      return "write"
    case "confirm":
      return "propose"
    case "send":
      return policy === "block" && isTrifecta(taint) ? "refuse" : "propose"
  }
}

/** Ce que reçoit le modèle quand un envoi est refusé. */
export const TRIFECTA_REFUSAL =
  "Envoi refusé : ce tour a lu des données privées et du contenu venu de tiers. Propose l'envoi dans un nouveau message, sans contenu de tiers."
