/**
 * La règle unique des surfaces flottantes : menus, sélecteurs, combobox,
 * popovers (2026-09-27).
 *
 * Base UI retourne une surface qui manque de place (`flip`) mais, par défaut,
 * ne la décale pas le long de son ancre : un menu de 16 rem aligné sur un
 * bouton près du bord d'un téléphone sortait de l'écran (menu d'une phase,
 * choix de l'organisation d'un document). `align: "shift"` la ramène dans la
 * fenêtre, `fallbackAxisSide: "none"` évite qu'elle saute sur le côté de
 * l'ancre, et la marge garde 8 px entre la surface et le bord.
 */
export const FLOATING_COLLISION_AVOIDANCE = {
  side: "flip",
  align: "shift",
  fallbackAxisSide: "none",
} as const

export const FLOATING_COLLISION_PADDING = 8

/**
 * Le fond de toute surface flottante, opaque (2026-10-05) : le verre dépoli
 * (`bg-popover/80` + flou) laissait voir un bouton blanc posé dessous.
 * `--popover` et `--muted` sont redéfinis sur la surface : un pied collé en
 * `bg-popover` (sélecteurs de projet et de client) prend la même teinte, et le
 * survol des items (`bg-muted`) reste lisible sur le fond plus clair du thème
 * sombre (jetons `--floating`, `--floating-muted` dans `styles.css`).
 */
export const FLOATING_SURFACE =
  "bg-popover text-popover-foreground shadow-xl shadow-black/5 [--muted:var(--floating-muted)] [--popover:var(--floating)]"

/**
 * Jamais plus large que la fenêtre, marges comprises : une largeur fixe
 * (`w-72`) passée par l'appelant ne peut plus déborder d'un écran de 320 px.
 */
export const FLOATING_MAX_WIDTH = "max-w-[calc(100vw-1rem)]"

/**
 * Un sous-menu (« Déplacer vers ») n'a souvent pas la place de se retourner
 * sur un téléphone : il glisse dans la fenêtre, quitte à chevaucher son menu.
 */
export const FLOATING_SUBMENU_COLLISION_AVOIDANCE = {
  side: "shift",
  align: "shift",
  fallbackAxisSide: "none",
} as const
