/**
 * Couleur du client → variables d'accent de Starlight, en clair et en sombre.
 *
 * On garde la teinte et la saturation de la couleur donnée, et on ajuste seulement sa
 * luminosité (OKLCH) jusqu'au contraste exigé : un lien reste lisible à 4,5:1 sur le fond,
 * quelle que soit la couleur choisie par le client.
 */
export type Oklch = { l: number; c: number; h: number }
export type AccentPalette = { low: string; accent: string; high: string; onAccent: string }
export type Theme = { light: AccentPalette; dark: AccentPalette }

/** Accent violet de la DA HGDC (`--brand-accent` du kit), si le client n'en donne pas. */
export const HGDC_ACCENT = "#7c3aed"

/** Fonds sur lesquels l'accent doit tenir 4,5:1 : la surface la plus proche de lui (élément
 *  courant teinté, encart `muted`), un cran plus foncé ou plus clair que la page. */
const LIGHT_BG = "#f2f2f2"
const DARK_BG = "#2a2a2a"

export function themeFor(primary: string = HGDC_ACCENT, dark?: string): Theme {
  const base = hexToOklch(primary)
  const darkBase = dark ? hexToOklch(dark) : base
  return {
    light: palette(base, LIGHT_BG, { low: 0.955, high: 0.36 }),
    dark: palette(darkBase, DARK_BG, { low: 0.27, high: 0.9 }),
  }
}

function palette(base: Oklch, background: string, tones: { low: number; high: number }): AccentPalette {
  const accent = withContrast(base, background, 4.5)
  const low = oklchToHex({ l: tones.low, c: Math.min(base.c, 0.06), h: base.h })
  const high = withContrast({ ...base, l: tones.high }, low, 7)
  const onAccent = contrast("#ffffff", accent) >= contrast("#000000", accent) ? "#ffffff" : "#000000"
  return { low, accent, high, onAccent }
}

/** Couleur la plus proche de `color`, en luminosité seulement, qui atteint `ratio` sur `background`. */
export function withContrast(color: Oklch, background: string, ratio: number): string {
  const towardsDark = luminance(background) > 0.5
  let l = color.l
  for (let i = 0; i < 100; i++) {
    const hex = oklchToHex({ ...color, l })
    if (contrast(hex, background) >= ratio) return hex
    l = towardsDark ? l - 0.01 : l + 0.01
    if (l <= 0 || l >= 1) break
  }
  return towardsDark ? "#000000" : "#ffffff"
}

export function themeCss(theme: Theme): string {
  const vars = (p: AccentPalette) =>
    `--sl-color-accent-low:${p.low};--sl-color-accent:${p.accent};--sl-color-accent-high:${p.high};--hgdc-on-accent:${p.onAccent};`
  // Clair par défaut : le sombre ne vaut que choisi (`data-hd-theme`, overrides/ThemeProvider.astro).
  return `:root{${vars(theme.dark)}}:root:not([data-hd-theme="dark"]){${vars(theme.light)}}`
}

// --- Conversions sRGB ↔ OKLCH (Björn Ottosson) et contraste WCAG 2 ---

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "")
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

export function oklchToHex({ l: L, c, h }: Oklch): string {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear)
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
