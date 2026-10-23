import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8")

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `bloc ${selector} introuvable`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf("\n}", start))
}

function declared(body: string): Set<string> {
  return new Set([...body.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1] ?? ""))
}

const light = declared(block(":root"))
// Un jeton défini par un autre (`--popover: var(--card)`) suit ce jeton dans les deux thèmes.
const aliases = new Set([...block(":root").matchAll(/^\s*(--[\w-]+): var\(--[\w-]+\);/gm)].map((m) => m[1] ?? ""))
const dark = declared(block(".dark"))
const theme = new Set([...declared(block("@theme")), ...declared(block("@theme inline"))])

// Jetons identiques dans les deux thèmes, ou dérivés d'un autre (`--ring` suit `--accent`).
const THEME_INVARIANT = new Set([
  "--radius",
  "--scrollbar-thumb",
  "--accent-soft",
  // Panneau inversé : encre sombre dans les deux thèmes, seul `--inverse` fonce en sombre.
  "--inverse-foreground",
  "--inverse-muted",
  "--inverse-code",
])

describe("styles.css", () => {
  it("garde le violet pour l’accent : l’information est bleue", () => {
    const hue = (token: string) =>
      Number(new RegExp(`\\n  ${token}: oklch\\([\\d.]+ [\\d.]+ ([\\d.]+)\\)`).exec(block(":root"))?.[1])
    const accent = Number(/--accent: var\(--brand-accent, oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(css)?.[1])
    expect(Math.abs(hue("--info") - accent)).toBeGreaterThan(30)
  })

  it("donne au thème sombre chaque couleur du thème clair", () => {
    const missing = [...light].filter((token) => !dark.has(token) && !THEME_INVARIANT.has(token) && !aliases.has(token))
    expect(missing).toEqual([])
  })

  it("ne déclare en sombre aucun jeton absent du thème clair", () => {
    expect([...dark].filter((token) => !light.has(token))).toEqual([])
  })

  it("relie chaque utilitaire Tailwind à un jeton déclaré", () => {
    const targets = [...block("@theme inline").matchAll(/^\s*--color-[\w-]+: var\((--[\w-]+)\)/gm)].map((m) => m[1])
    expect(targets.filter((token) => token !== undefined && !light.has(token))).toEqual([])
  })

  it("déclare chaque variable de la DA lue par un composant", () => {
    const sources = readdirSync(new URL(".", import.meta.url)).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    const used = new Set<string>()
    for (const file of sources) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8")
      for (const m of text.matchAll(/(?:var\(|\()(--[\w-]+)/g)) if (m[1]) used.add(m[1])
    }
    // Variables posées à l'exécution par Base UI (positionnement, glissement des feuilles).
    const runtime = /^--(active-tab-|anchor-|available-|bleed|collapsible-|drawer-|transform-origin)/
    const unknown = [...used].filter((v) => !runtime.test(v) && !light.has(v) && !theme.has(v))
    expect(unknown).toEqual([])
  })
})

describe("contrôle éteint (WCAG 1.4.11)", () => {
  // Gris achromatique : la luminance relative vaut L³ en OKLab.
  function grey(selector: string, token: string): number {
    const match = block(selector).match(new RegExp(String.raw`^\s*--${token}: oklch\(([\d.]+) 0 0\);`, "m"))
    expect(match, `${selector} --${token} doit être un gris oklch opaque`).toBeTruthy()
    return Number(match?.[1]) ** 3
  }
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

  for (const selector of [":root", ".dark"])
    it(`${selector} : piste et bords éteints à 3:1 au moins du fond, d'une carte et de --muted`, () => {
      const off = grey(selector, "control-off")
      for (const surface of ["background", "card", "muted"])
        expect(contrast(off, grey(selector, surface)), surface).toBeGreaterThanOrEqual(3)
    })
})

describe("avatars à initiales (WCAG 1.4.3)", () => {
  // OKLCH vers sRGB linéaire (Björn Ottosson), puis luminance relative.
  function linear(L: number, C: number, H: number): Array<number> {
    const h = (H * Math.PI) / 180
    const a = C * Math.cos(h)
    const b = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
  }
  function color(selector: string, token: string): Array<number> {
    const match = block(selector).match(new RegExp(String.raw`^\s*${token}: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);`, "m"))
    expect(match, `${selector} ${token}`).toBeTruthy()
    return linear(Number(match?.[1]), Number(match?.[2]), Number(match?.[3]))
  }
  const luminance = ([r = 0, g = 0, b = 0]: Array<number>) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

  for (const selector of [":root", ".dark"])
    it(`${selector} : sept teintes dans le gamut sRGB, initiales à 4,5:1 au moins`, () => {
      for (let tone = 1; tone <= 7; tone++) {
        const background = color(selector, `--avatar-${tone}`)
        const ink = color(selector, `--avatar-${tone}-ink`)
        for (const channel of [...background, ...ink]) {
          expect(channel, `--avatar-${tone}`).toBeGreaterThanOrEqual(0)
          expect(channel, `--avatar-${tone}`).toBeLessThanOrEqual(1)
        }
        expect(contrast(luminance(background), luminance(ink)), `--avatar-${tone}`).toBeGreaterThanOrEqual(4.5)
      }
    })
})

describe("transitions de vue entre documents (ADR 0020)", () => {
  it("activées seulement sans mouvement réduit", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*@view-transition \{\s*navigation: auto;\s*\}\s*\}/,
    )
    expect(css.match(/@view-transition/g)).toHaveLength(1)
  })

  it("un nom stable pour la barre des produits, la barre latérale, la barre du haut et le H", () => {
    const names = [
      ...css.matchAll(/\[data-slot="([\w-]+)"\](?: > \[data-stage\])? \{\s*view-transition-name: ([\w-]+);/g),
    ].map((m) => [m[1], m[2]])
    expect(names).toEqual([
      ["product-rail", "hgdc-product-rail"],
      ["app-shell-sidebar", "hgdc-sidebar"],
      ["app-shell-header", "hgdc-header"],
      // Le cadre du chargeur, hors de la coque : les mêmes noms, seulement quand il est à l'écran.
      ["shell-frame-rail", "hgdc-product-rail"],
      ["shell-frame-sidebar", "hgdc-sidebar"],
      ["shell-frame-header", "hgdc-header"],
      ["family-loader-root", "hgdc-loader"],
    ])
    const sources = ["app-shell.tsx", "product-rail.tsx", "shell-frame.tsx", "family-loader.tsx"]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("")
    for (const [slot] of names) expect(sources).toContain(`data-slot="${slot}"`)
  })

  it("barre des produits et H : ni fondu ni mouvement des deux côtés, un fondu court d'un seul côté", () => {
    for (const name of ["hgdc-product-rail", "hgdc-loader"]) {
      const rule = (selector: string) => {
        const start = css.indexOf(selector)
        expect(start, selector).toBeGreaterThan(-1)
        return css.slice(css.indexOf("{", start), css.indexOf("}", start))
      }
      expect(rule(`::view-transition-group(${name})`)).toContain("animation: none;")
      expect(rule(`::view-transition-new(${name})`)).toContain("animation: none;")
      const old = rule(`::view-transition-old(${name})`)
      expect(old).toContain("animation: none;")
      expect(old).toContain("opacity: 0;")
      expect(rule(`::view-transition-old(${name}):only-child`)).toContain("hgdc-view-out")
      expect(rule(`::view-transition-new(${name}):only-child`)).toContain("hgdc-view-in")
    }
  })
})
