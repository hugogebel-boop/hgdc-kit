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
const dark = declared(block(".dark"))
const theme = new Set([...declared(block("@theme")), ...declared(block("@theme inline"))])

// Jetons identiques dans les deux thèmes, ou dérivés d'un autre (`--ring` suit `--accent`).
const THEME_INVARIANT = new Set([
  "--radius",
  "--scrollbar-thumb",
  "--accent-soft",
  "--ring",
  // Panneau inversé : encre sombre dans les deux thèmes, seul `--inverse` fonce en sombre.
  "--inverse-foreground",
  "--inverse-muted",
  "--inverse-code",
])

describe("styles.css", () => {
  it("donne au thème sombre chaque couleur du thème clair", () => {
    const missing = [...light].filter((token) => !dark.has(token) && !THEME_INVARIANT.has(token))
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
    const runtime = /^--(anchor-|available-|bleed|drawer-|transform-origin)/
    const unknown = [...used].filter((v) => !runtime.test(v) && !light.has(v) && !theme.has(v))
    expect(unknown).toEqual([])
  })
})
