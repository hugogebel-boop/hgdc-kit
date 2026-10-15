/**
 * Couleurs des e-mails, en hex : les clients mail ne lisent ni oklch ni les variables CSS. Chaque
 * valeur est la traduction d'un jeton de `styles.css` (même nom), en deux thèmes.
 *
 * Blanc et noir purs sont évités (`#fffffe`, `#0a0a0a`) : Gmail et Outlook inversent les couleurs
 * en mode sombre, et une valeur légèrement décalée y résiste mieux.
 */

export type EmailTheme = {
  /** Fond autour de la carte (`muted`). */
  ground: string
  card: string
  ink: string
  /** Texte courant, un cran sous l'encre. */
  body: string
  /** Texte secondaire, pied de page. */
  muted: string
  border: string
  /** Fond du code et des détails. */
  wash: string
}

export const EMAIL_LIGHT: EmailTheme = {
  ground: "#f5f5f5",
  card: "#fffffe",
  ink: "#0a0a0a",
  body: "#404040",
  muted: "#696969",
  border: "#e5e5e5",
  wash: "#f5f5f5",
}

export const EMAIL_DARK: EmailTheme = {
  ground: "#0a0a0a",
  card: "#171717",
  ink: "#fafafa",
  body: "#d4d4d4",
  muted: "#a1a1a1",
  border: "#262626",
  wash: "#262626",
}

/** Accent d'un produit : `--accent` en clair et en sombre. */
export type EmailAccent = { light: string; dark: string }

/** L'accent violet de la DA, `oklch(0.55 0.25 296)` et `oklch(0.74 0.19 296)`. */
export const HGDC_EMAIL_ACCENT: EmailAccent = { light: "#8538ee", dark: "#b78dff" }

export type EmailTone = "neutral" | "info" | "success" | "warning" | "danger"

/** Encre, lavis et filet d'un encadré, par ton (jetons `--info`, `--status-*`, `--destructive`). */
export type ToneColors = { ink: string; wash: string; bar: string }

export const EMAIL_TONES: Readonly<Record<EmailTone, { light: ToneColors; dark: ToneColors }>> = {
  neutral: {
    light: { ink: "#404040", wash: "#f5f5f5", bar: "#a1a1a1" },
    dark: { ink: "#d4d4d4", wash: "#262626", bar: "#737373" },
  },
  info: {
    light: { ink: "#005aba", wash: "#edf6ff", bar: "#2584f5" },
    dark: { ink: "#83baff", wash: "#172537", bar: "#569fff" },
  },
  success: {
    light: { ink: "#006836", wash: "#e6fcec", bar: "#0a924b" },
    dark: { ink: "#6cd092", wash: "#132a1b", bar: "#46b86e" },
  },
  warning: {
    light: { ink: "#8e5400", wash: "#fff4d7", bar: "#b67700" },
    dark: { ink: "#edbb64", wash: "#32230e", bar: "#edbb64" },
  },
  danger: {
    light: { ink: "#b7191c", wash: "#fff0ee", bar: "#e7000b" },
    dark: { ink: "#ff8482", wash: "#391a17", bar: "#ff6467" },
  },
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX.test(value)
}

function channels(hex: string): [number, number, number] {
  const full = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, (c) => c + c) : hex
  return [1, 3, 5].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** Luminance relative WCAG 2. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rapport de contraste WCAG 2 entre deux couleurs hex, de 1 à 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Le texte le plus lisible sur un fond : quasi blanc ou quasi noir. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#fffffe") >= contrastRatio(background, "#0a0a0a") ? "#fffffe" : "#0a0a0a"
}
