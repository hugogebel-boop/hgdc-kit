// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cleanup, render, screen } from "@testing-library/react"
import { transform } from "lightningcss"
import { afterEach, describe, expect, it } from "vitest"

import { FamilyLoader } from "./family-loader.tsx"

afterEach(cleanup)

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"), "utf8")

const minified = transform({
  filename: "styles.css",
  code: Buffer.from(css),
  minify: true,
  errorRecovery: true,
  targets: { chrome: 111 << 16, safari: 16 << 16, firefox: 128 << 16 },
}).code.toString()

/** Les règles minifiées hors mouvement réduit. */
const normal = minified.slice(0, minified.indexOf("@media (prefers-reduced-motion:reduce){.family-loader"))

describe("FamilyLoader", () => {
  it("s'annonce « Chargement… » en `role=status`", () => {
    render(<FamilyLoader />)
    const status = screen.getByRole("status", { name: "Chargement…" })
    expect(status.dataset.slot).toBe("family-loader")
  })

  it("dessine les trois pièces du H, chacune avec sa couche de remplissage", () => {
    const { container } = render(<FamilyLoader />)
    const pieces = [...container.querySelectorAll("[data-piece]")]
    expect(pieces.map((piece) => piece.getAttribute("data-piece"))).toEqual(["left", "right", "bar"])
    for (const piece of pieces) expect(piece.querySelector("[data-fill]")).not.toBeNull()
  })

  it("garde la géométrie du H de la famille (sur 256)", () => {
    for (const value of ["* 43 / 256", "* 156 / 256", "* 57 / 256", "* 208 / 256", "* 67 / 256", "* 107 / 256"])
      expect(css).toContain(value)
  })

  it("64 px en page, 40 px par défaut, 24 px en petit", () => {
    const size = () => screen.getByRole("status").style.getPropertyValue("--family-loader-size")
    render(<FamilyLoader page />)
    expect(size()).toBe("64px")
    cleanup()
    render(<FamilyLoader />)
    expect(size()).toBe("40px")
    cleanup()
    render(<FamilyLoader size="sm" />)
    expect(size()).toBe("24px")
  })

  it("silhouette toujours visible : la pièce elle-même est grise, seul le remplissage bouge", () => {
    expect(normal).toMatch(/\.family-loader \[data-piece\]\{[^}]*background:var\(--fl-ghost\)/)
    expect(normal).not.toMatch(/\.family-loader \[data-piece\]\{[^}]*animation/)
  })

  it("minifié comme dans les produits (lightningcss, Vite) : chaque remplissage garde son animation, transform seul", () => {
    for (const [piece, name] of [
      ["left", "family-loader-rise"],
      ["right", "family-loader-rise"],
      ["bar", "family-loader-sweep"],
    ] as const) {
      const rule = normal.match(
        new RegExp(String.raw`\.family-loader \[data-piece=${piece}\] \[data-fill\]\{([^}]*)\}`),
      )?.[1]
      expect(rule, piece).toMatch(new RegExp(String.raw`animation:[^;]*\b${name}\b[^;]*infinite`))
    }
    expect(normal).not.toMatch(/\.family-loader[^{]*\{[^}]*animation:none/)
    for (const name of ["family-loader-rise", "family-loader-sweep"]) {
      const keyframes = minified.match(new RegExp(String.raw`@keyframes ${name}\{(.*?)\}\}`))?.[1] ?? ""
      expect(keyframes).toContain("transform")
      expect(keyframes).not.toMatch(/clip-path|opacity|height|width/)
    }
  })

  it("mouvement réduit : le remplissage pulse en place, sans mouvement", () => {
    const reduced = minified.slice(minified.indexOf("@media (prefers-reduced-motion:reduce){.family-loader"))
    const rule = reduced.match(/\[data-fill\]\{([^}]*)\}/)?.[1] ?? ""
    expect(rule).toContain("transform:none")
    expect(rule).toMatch(/animation:[^;]*family-loader-glow/)
  })

  it("`page` le centre dans l'écran", () => {
    const { container } = render(<FamilyLoader page />)
    const wrapper = container.firstElementChild
    expect(wrapper?.getAttribute("data-slot")).toBe("family-loader-page")
    expect(wrapper?.className).toContain("place-items-center")
  })
})
