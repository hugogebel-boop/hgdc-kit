// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cleanup, render, screen } from "@testing-library/react"
import { transform } from "lightningcss"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"

import {
  FAMILY_LOADER_PERIOD_MS,
  FamilyLoader,
  FamilyLoaderHost,
  familyLoaderPhase,
  familyLoaderStartTime,
  syncFamilyLoader,
} from "./family-loader.tsx"

afterEach(cleanup)

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"), "utf8")

const minified = transform({
  filename: "styles.css",
  code: Buffer.from(css),
  minify: true,
  errorRecovery: true,
  targets: { chrome: 111 << 16, safari: 16 << 16, firefox: 128 << 16 },
}).code.toString()

const REDUCED = "@media (prefers-reduced-motion:reduce){.family-loader"
/** Les règles minifiées hors mouvement réduit. */
const normal = minified.slice(0, minified.indexOf(REDUCED))
const keyframes = (name: string) => minified.match(new RegExp(String.raw`@keyframes ${name}\{(.*?)\}\}`))?.[1] ?? ""

describe("FamilyLoader", () => {
  it("s'annonce « Chargement… » en `role=status`", () => {
    render(<FamilyLoader />)
    const status = screen.getByRole("status", { name: "Chargement…" })
    expect(status.dataset.slot).toBe("family-loader")
  })

  it("dessine les trois pièces du H plein dans l'ordre de la boucle, chacune avec sa couche de remplissage", () => {
    const { container } = render(<FamilyLoader />)
    const pieces = [...container.querySelectorAll('[data-slot="family-loader"] > [data-piece]')]
    expect(pieces.map((piece) => piece.getAttribute("data-piece"))).toEqual(["left", "bar", "right"])
    for (const piece of pieces) expect(piece.querySelector("[data-fill]")).not.toBeNull()
  })

  it("un seul H : trois pièces, ni reflet, ni ombre, ni double", () => {
    const { container } = render(<FamilyLoader />)
    const loader = container.querySelector('[data-slot="family-loader"]')
    expect(loader?.children.length).toBe(3)
    expect(container.querySelectorAll("[data-piece]").length).toBe(3)
    expect(container.querySelector("[data-reflet]")).toBeNull()
    const loaderCss = css
      .slice(css.indexOf(".family-loader {"), css.indexOf("/* Scène du chargement"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
    expect(loaderCss).not.toMatch(/reflet|shadow|drop-shadow|blur\(/)
    expect(renderToString(<FamilyLoaderHost />)).not.toContain("reflet")
  })

  it("H centré dans son cadre de 46 unités (montants de 10 × 36, pont de 11 × 9)", () => {
    expect(css).toContain("--fl-u: calc(var(--fl) / 46);")
    for (const value of ["* 5)", "* 10)", "* 36)", "* 8)", "* 28)", "* 17.5)", "* 18.5)", "* 11)", "* 9)"])
      expect(css).toContain(`calc(var(--fl-u) ${value}`)
    // Centre du H (8 + 38) / 2 = 23 et (5 + 41) / 2 = 23 : le milieu du cadre.
    expect((8 + 28 + 10) / 2).toBe(23)
    expect((5 + 5 + 36) / 2).toBe(23)
  })

  it("40 px par défaut, 24 px en petit, 64 px en grand", () => {
    const size = () => screen.getByRole("status").style.getPropertyValue("--family-loader-size")
    render(<FamilyLoader />)
    expect(size()).toBe("40px")
    cleanup()
    render(<FamilyLoader size="sm" />)
    expect(size()).toBe("24px")
    cleanup()
    render(<FamilyLoader size="lg" />)
    expect(size()).toBe("64px")
  })

  it("silhouette toujours visible : la pièce elle-même est grise, seul le remplissage bouge", () => {
    expect(normal).toMatch(/\.family-loader>\[data-piece\]\{[^}]*background:var\(--fl-ghost\)/)
    expect(normal).not.toMatch(/\.family-loader \[data-piece\]\{[^}]*animation/)
  })

  it("une seule boucle : même durée pour les trois pièces, aucun délai, période = FAMILY_LOADER_PERIOD_MS", () => {
    const fill = normal.match(/\.family-loader \[data-fill\]\{([^}]*)\}/)?.[1] ?? ""
    expect(fill).toContain(`animation-duration:${FAMILY_LOADER_PERIOD_MS / 1000}s`)
    expect(fill).toContain("animation-iteration-count:infinite")
    expect(minified).not.toMatch(/\.family-loader[^{]*\{[^}]*animation-delay/)
    expect(minified).not.toMatch(/\.family-loader[^{]*\{[^}]*animation:/)
    for (const [piece, name] of [
      ["left", "family-loader-left"],
      ["bar", "family-loader-bar"],
      ["right", "family-loader-right"],
    ] as const) {
      const rule = normal.match(
        new RegExp(String.raw`\.family-loader \[data-piece=${piece}\] \[data-fill\]\{([^}]*)\}`),
      )?.[1]
      expect(rule, piece).toContain(`animation-name:${name}`)
      // Seuls transform et opacity, sur la couche de remplissage.
      const frames = keyframes(name)
      expect(frames, name).toContain("transform")
      expect(frames, name).not.toMatch(/clip-path|height|width|top|left/)
    }
  })

  it("le H complet tient de 55 % à 75 % de la boucle, puis se vide d'un fondu (opacité), d'un seul geste", () => {
    for (const name of ["family-loader-left", "family-loader-bar", "family-loader-right"]) {
      const frames = keyframes(name)
      expect(frames, name).toMatch(/75%\{opacity:1;[^}]*transform:/)
      expect(frames, name).toMatch(/87\.5%\{opacity:0;[^}]*transform:/)
    }
    // Pièce après pièce : gauche pleine à 25 %, barre à 40 %, droite à 55 %.
    expect(keyframes("family-loader-left")).toMatch(/25%,75%\{[^}]*transform:translateY\(0\)\}/)
    expect(keyframes("family-loader-bar")).toMatch(/40%,75%\{[^}]*transform:translate(?:X)?\(0\)\}/)
    expect(keyframes("family-loader-right")).toMatch(/55%,75%\{[^}]*transform:scaleY\(1\)\}/)
  })

  it("mouvement réduit : le H plein, immobile", () => {
    const reduced = minified.slice(minified.indexOf(REDUCED))
    const rule = reduced.match(/\[data-fill\]\{([^}]*)\}/)?.[1] ?? ""
    expect(rule).toContain("transform:none")
    expect(rule).toContain("opacity:1")
    expect(rule).toContain("animation-name:none")
  })
})

describe("Phase calée sur l'horloge", () => {
  it("deux documents nés à des instants différents donnent la même phase au même instant", () => {
    const now = 1_760_000_123_456.25
    for (const timeOrigin of [1_760_000_000_000, 1_760_000_100_777.5, 1_760_000_123_000]) {
      const start = familyLoaderStartTime(timeOrigin)
      expect(start).toBeLessThanOrEqual(0)
      expect(start).toBeGreaterThan(-FAMILY_LOADER_PERIOD_MS)
      // Temps de la ligne de temps du document à cet instant, puis phase de l'animation.
      const documentTime = now - timeOrigin
      const phase =
        (((documentTime - start) % FAMILY_LOADER_PERIOD_MS) + FAMILY_LOADER_PERIOD_MS) % FAMILY_LOADER_PERIOD_MS
      expect(phase).toBeCloseTo(familyLoaderPhase(now), 6)
    }
  })

  it("syncFamilyLoader pose ce début sur chaque animation du H", () => {
    const animations = [
      { animationName: "family-loader-left", startTime: 12 as number | null },
      { animationName: "family-loader-bar", startTime: null as number | null },
      // Une transition (fondu du chargeur) garde son départ.
      { transitionProperty: "opacity", startTime: 40 as number | null },
    ]
    const root = { getAnimations: () => animations } as unknown as Element
    syncFamilyLoader(root)
    const expected = familyLoaderStartTime(performance.timeOrigin)
    expect(animations.map((animation) => animation.startTime)).toEqual([expected, expected, 40])
    syncFamilyLoader(null)
  })

  it("rendu serveur : le H du document et son script de calage, en ligne, avant l'hydratation", () => {
    const html = renderToString(<FamilyLoaderHost />)
    expect(html).toMatch(
      /^<div data-slot="family-loader-root" aria-hidden="true"><div data-frame="true"><div data-slot="shell-frame"/,
    )
    // Le cadre de la coque (ADR 0020), puis la scène du H.
    expect(html).toMatch(/<\/div><\/div><\/div><div data-stage="true"><span data-slot="family-loader"/)
    expect(html).toContain('data-slot="family-loader"')
    expect(html).toMatch(/<\/div><script>\(function\(e\)\{/)
    expect(html).toContain("previousElementSibling")
    expect(html).toContain(`var p=${FAMILY_LOADER_PERIOD_MS}`)
    expect(html).toContain("animationstart")
  })
})

describe("Scène du chargement", () => {
  it("le H du document est en position fixe sur la zone de contenu de la coque", () => {
    const stage = minified.match(/\[data-slot=family-loader-root\]>\[data-stage\]\{([^}]*)\}/)?.[1] ?? ""
    expect(stage).toContain("position:fixed")
    expect(stage).toContain("top:var(--hgdc-stage-top)")
    expect(stage).toContain("left:var(--hgdc-stage-left)")
    // Ordinateur : barre des produits 56 px + barre latérale 256 px (64 en rail), en-tête 56 px + marge 8 px.
    expect(css).toContain("--hgdc-rail-w: 3.5rem;")
    expect(css).toContain("--hgdc-sidebar-w: 16rem;")
    expect(css).toMatch(/:root\[data-sidebar="rail"\] \{\s*--hgdc-sidebar-w: 4rem;/)
    expect(css).toContain("--hgdc-stage-top: 4rem;")
    // Téléphone : sous l'en-tête et la zone sûre.
    expect(css).toContain("--hgdc-stage-top: calc(env(safe-area-inset-top, 0px) + 3.5rem);")
  })

  it("montré par une page qui attend, par la coque qui charge, ou avant l'hydratation", () => {
    for (const condition of [
      String.raw`:root:has([data-slot="page-pending"]):not(:has([data-slot="app-shell"])) [data-slot="family-loader-root"]`,
      String.raw`:root:has([data-slot="app-shell"][data-loading]) [data-slot="family-loader-root"]`,
      String.raw`:root:has([data-slot="app-shell"]:not([data-hydrated]) [data-slot="page-pending"]) [data-slot="family-loader-root"]`,
    ])
      expect(css).toContain(condition)
  })

  it("masqué avec une retenue de 80 ms : une page qui en remplace une autre ne fait pas clignoter le H", () => {
    const rule = css.match(/\[data-slot="family-loader-root"\] \{([^}]*)\}/)?.[1] ?? ""
    expect(rule).toContain("opacity 120ms var(--ease-out) 80ms")
    const layer = css.match(/\[data-slot="app-shell-loading"\] \{([^}]*)\}/)?.[1] ?? ""
    expect(layer).toContain("opacity 120ms var(--ease-out) 80ms")
  })
})

describe("Cadre de la coque, hors de la coque (ADR 0020)", () => {
  it("dès le rendu serveur : la barre des produits complète, la marque de chaque produit, la barre du haut", () => {
    const html = renderToString(<FamilyLoaderHost />)
    const rail = html.slice(
      html.indexOf('data-slot="shell-frame-rail"'),
      html.indexOf('data-slot="shell-frame-sidebar"'),
    )
    expect(rail).toContain('data-slot="org-placeholder"')
    // Account, puis les produits ouverts du catalogue, dans l'ordre de la barre.
    expect([...rail.matchAll(/data-product="(\w+)"/g)].map((m) => m[1])).toEqual([
      "account",
      "host",
      "mail",
      "portal",
      "status",
      "analytics",
      "docs",
      "iassistant",
      "id",
    ])
    const sidebar = html.slice(html.indexOf('data-slot="shell-frame-sidebar"'))
    for (const name of ["Account", "Host", "Mail", "Portal", "Status", "Analytics", "Docs", "IAssistant"])
      expect(sidebar).toContain(`>${name}<`)
    expect(html).toContain('data-slot="shell-frame-nav"')
    expect(html).toContain('data-slot="shell-frame-header"')
  })

  it("le produit de l'adresse marqué par le CSS, l'organisation retenue dessinée comme OrgMark", () => {
    expect(minified).toContain(":root[data-hgdc-product=mail] [data-slot=shell-frame-rail] [data-product=mail]")
    expect(minified).toMatch(
      /:root\[data-hgdc-org\] \[data-slot=org-placeholder-mark\]:before\{content:var\(--hgdc-org-initials,""\)\}/,
    )
  })

  it("les noms de transition du cadre et du H compilent (imbrication résolue)", () => {
    expect(minified).toContain("view-transition-name:hgdc-loader")
    expect(minified).not.toMatch(/&\s*\[data-slot/)
  })
})
