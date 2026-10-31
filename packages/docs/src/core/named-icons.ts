/**
 * Icônes nommées des composants (`<Card icon="rocket">`), comme chez Mintlify : le jeu Lucide
 * (`@iconify-json/lucide`, licence ISC), plus les noms Font Awesome que Mintlify accepte et qui
 * ont un équivalent. Une fonction pure : le site lui passe le jeu au build (aucun script chez la
 * lectrice), l'éditeur de la console le charge à la demande.
 */

export type IconSet = {
  icons: Record<string, { body: string; width?: number; height?: number }>
  aliases?: Record<string, { parent: string }>
  width?: number
  height?: number
}

/** Noms Font Awesome courants dans les docs Mintlify → nom Lucide. */
const FONT_AWESOME: Record<string, string> = {
  "circle-info": "info",
  "info-circle": "info",
  "check-circle": "circle-check",
  "triangle-exclamation": "triangle-alert",
  "exclamation-triangle": "triangle-alert",
  "circle-exclamation": "circle-alert",
  gear: "settings",
  gears: "settings",
  "magnifying-glass": "search",
  "file-lines": "file-text",
  "pen-to-square": "square-pen",
  "arrow-up-right-from-square": "external-link",
  "up-right-from-square": "external-link",
  bolt: "zap",
  "bolt-lightning": "zap",
  "circle-question": "circle-help",
  "question-circle": "circle-help",
  xmark: "x",
  "trash-can": "trash-2",
  "floppy-disk": "save",
  "cloud-arrow-up": "cloud-upload",
  "cloud-arrow-down": "cloud-download",
  "right-to-bracket": "log-in",
  "right-from-bracket": "log-out",
  "user-group": "users",
  "screwdriver-wrench": "wrench",
  "chart-simple": "chart-column",
  envelope: "mail",
  comments: "messages-square",
  comment: "message-square",
  robot: "bot",
  "wand-magic-sparkles": "wand-sparkles",
  "shield-halved": "shield",
  "puzzle-piece": "puzzle",
  "layer-group": "layers",
  "list-check": "list-checks",
}

/** Le nom Lucide d'une icône écrite dans une page, ou `null` si le jeu ne la connaît pas. */
export function resolveIcon(set: IconSet, name: string | null | undefined): string | null {
  const wanted = name?.trim().toLowerCase().replace(/^fa-/, "")
  if (!wanted) return null
  for (const candidate of [wanted, FONT_AWESOME[wanted]]) {
    if (!candidate) continue
    if (set.icons[candidate]) return candidate
    const parent = set.aliases?.[candidate]?.parent
    if (parent && set.icons[parent]) return parent
  }
  return null
}

/**
 * Le `<svg>` d'une icône, prêt à poser dans la page (classe `hd-named-icon`, `currentColor`).
 * Le corps vient du paquet d'icônes, jamais de la page : le nom ne sert qu'à le choisir.
 */
export function namedIconSvg(set: IconSet, name: string | null | undefined, size = 16): string | null {
  const resolved = resolveIcon(set, name)
  if (!resolved) return null
  const icon = set.icons[resolved]!
  const width = icon.width ?? set.width ?? 24
  const height = icon.height ?? set.height ?? 24
  return `<svg class="hd-named-icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`
}
