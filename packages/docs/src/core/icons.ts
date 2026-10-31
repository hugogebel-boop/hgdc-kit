/**
 * Icônes du modèle, au trait (24 × 24, 1,75), dessinées en ligne : aucune requête, aucune
 * police d'icônes. Un seul dessin pour le site (`overrides/Icon.astro`) et pour le mode visuel
 * de l'éditeur de la console, qui montre les mêmes encadrés et les mêmes cartes.
 */
export const ICON_PATHS = {
  menu: "M4 7h16M4 12h16M4 17h10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  sparkles:
    "M12 3.5 13.6 8a3 3 0 0 0 1.9 1.9L20 11.5l-4.5 1.6a3 3 0 0 0-1.9 1.9L12 19.5 10.4 15a3 3 0 0 0-1.9-1.9L4 11.5 8.5 9.9A3 3 0 0 0 10.4 8ZM19 3v3M20.5 4.5h-3",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
  monitor: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 15h8m-4-3v3",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Zm-4 6H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5",
  check: "m5 12.5 4.5 4.5L19 7.5",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-left": "m15 6-6 6 6 6",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  "arrow-up-right": "M7 17 17 7M8 7h9v9",
  x: "M6 6l12 12M18 6 6 18",
  flag: "M12 8v4.5M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  list: "M4 6h16M4 12h10M4 18h13",
  "thumbs-up":
    "M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z",
  "thumbs-down":
    "M17 14V3M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.5l2.3-7A2 2 0 0 1 6.5 3H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-4.5m0-3.5h.01",
  note: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-4.5m0-3.5h.01",
  tip: "M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.6.8.6 1.2v.5h6V15c0-.4.2-.8.6-1.2A6 6 0 0 0 12 3Z",
  warning: "M12 9.5v4M12 17h.01M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  danger: "M12 8v4.5M12 16h.01M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3Z",
  "circle-check": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 2.8 2.8L16 9.5",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 0v5h5M9 13h6m-6 4h4",
  hash: "M5 9h14M5 15h14M10 4 8 20M16 4l-2 16",
  rotate: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  expand: "M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6",
  shrink: "M14 10h6M14 10V4M10 14H4m6 0v6M14 10l6-6M10 14l-6 6",
  markdown:
    "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 9V9l2.5 3L12 9v6m5-6v6m-2-2 2 2 2-2",
  external: "M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4",
} as const

export type IconName = keyof typeof ICON_PATHS

/** Attributs du `<svg>` d'une icône, communs au site et à la console. */
export const ICON_SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const
