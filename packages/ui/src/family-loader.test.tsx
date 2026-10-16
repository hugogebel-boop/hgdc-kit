// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cleanup, render, screen } from "@testing-library/react"
import { transform } from "lightningcss"
import { afterEach, describe, expect, it } from "vitest"

import { FamilyLoader } from "./family-loader.tsx"
import { FAMILY_MARK_SVG } from "./family-svg.ts"

afterEach(cleanup)

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"), "utf8")

describe("FamilyLoader", () => {
  it("s'annonce « Chargement… » en `role=status`", () => {
    render(<FamilyLoader />)
    const status = screen.getByRole("status", { name: "Chargement…" })
    expect(status.dataset.slot).toBe("family-loader")
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("reprend exactement les trois pièces du H de la famille", () => {
    const { container } = render(<FamilyLoader />)
    const pieces = [...container.querySelectorAll("rect[data-piece]")].map((rect) =>
      ["x", "y", "width", "height", "rx"].map((name) => `${name}="${rect.getAttribute(name)}"`).join(" "),
    )
    expect(pieces).toHaveLength(3)
    for (const piece of pieces) expect(FAMILY_MARK_SVG).toContain(piece)
  })

  it("donne à chaque instance ses propres dégradés", () => {
    const { container } = render(
      <>
        <FamilyLoader />
        <FamilyLoader size="lg" label="Ouverture du projet…" />
      </>,
    )
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id)
    expect(new Set(ids).size).toBe(6)
    for (const rect of container.querySelectorAll("rect")) {
      const ref = rect.getAttribute("fill")?.match(/^url\(#(.+)\)$/)?.[1]
      expect(ids).toContain(ref)
    }
    expect(screen.getByRole("status", { name: "Ouverture du projet…" })).toBeDefined()
  })

  it("attend 120 ms avant d'apparaître, réglable", () => {
    render(<FamilyLoader />)
    expect(screen.getByRole("status").style.getPropertyValue("--family-loader-delay")).toBe("120ms")
    cleanup()
    render(<FamilyLoader delay={500} />)
    expect(screen.getByRole("status").style.getPropertyValue("--family-loader-delay")).toBe("500ms")
    expect(css).toMatch(/\.family-loader \{[^}]*opacity: 0;[^}]*var\(--family-loader-delay, 120ms\)/)
  })

  it("garde le fantôme du H sous les pièces : la boucle n'a jamais de trou", () => {
    const { container } = render(<FamilyLoader />)
    const ghost = container.querySelector("[data-ghost]")
    expect(ghost?.getAttribute("opacity")).toBe("0.15")
    expect(ghost?.querySelectorAll("rect")).toHaveLength(3)
    // Le fantôme n'est jamais animé ni masqué en mouvement normal.
    expect(css).not.toMatch(/\[data-ghost\][^{]*\{[^}]*animation/)
  })

  it("en page : taille lg (64 px) et centré sous l'en-tête", () => {
    const { container } = render(<FamilyLoader page />)
    expect(screen.getByRole("status").className).toContain("size-16")
    expect(container.firstElementChild?.className).toContain("place-items-center")
  })

  it("mouvement réduit : les pièces ne bougent plus, le H respire", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"))
    expect(reduced).toMatch(/\.family-loader \[data-piece\] \{\s*animation: none;/)
    expect(reduced).toMatch(/\.family-loader svg \{\s*animation: family-loader-breathe/)
  })

  it("minifié comme dans les produits (lightningcss, Vite), chaque pièce garde son animation", () => {
    const minified = transform({
      filename: "styles.css",
      code: Buffer.from(css),
      minify: true,
      errorRecovery: true,
      targets: { chrome: 111 << 16, safari: 16 << 16, firefox: 128 << 16 },
    }).code.toString()
    const reducedAt = minified.indexOf("@media (prefers-reduced-motion:reduce){.family-loader")
    expect(reducedAt).toBeGreaterThan(-1)
    const normal = minified.slice(0, reducedAt)
    for (const piece of ["left", "bar", "right"]) {
      const rule = normal.match(new RegExp(String.raw`\.family-loader \[data-piece=${piece}\]\{([^}]*)\}`))?.[1]
      expect(rule, piece).toMatch(new RegExp(String.raw`^animation:[^;]*\bfamily-loader-${piece}\b`))
      expect(rule, piece).toContain("infinite")
    }
    expect(normal).not.toMatch(/\.family-loader \[data-piece[^\]]*\]\{animation:none/)
    expect(minified.slice(reducedAt)).toMatch(/\.family-loader \[data-piece\]\{animation:none\}/)
  })

  it("`page` le centre dans un bloc de la hauteur de l'écran", () => {
    const { container } = render(<FamilyLoader page />)
    expect(container.firstElementChild?.getAttribute("data-slot")).toBe("family-loader-page")
  })
})
