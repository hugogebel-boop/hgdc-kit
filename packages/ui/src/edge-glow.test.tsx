// @vitest-environment happy-dom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { EDGE_GLOW, EdgeGlow, edgeGlowClock } from "./edge-glow.tsx"

describe("edgeGlowClock", () => {
  it("donne la même image au même instant, d'une page à l'autre", () => {
    expect(edgeGlowClock(1_762_855_000_123)).toEqual(edgeGlowClock(1_762_855_000_123))
  })

  it("pulsation : une phase de 0 à 1 qui boucle sur la période", () => {
    expect(edgeGlowClock(0).pulse).toBe(0)
    expect(edgeGlowClock(EDGE_GLOW.pulsePeriodMs / 2).pulse).toBe(0.5)
    expect(edgeGlowClock(EDGE_GLOW.pulsePeriodMs * 7).pulse).toBe(0)
  })

  it("temps des vagues ramené sous 2π × 1000, pour la précision du GPU", () => {
    const { time } = edgeGlowClock(Date.UTC(2030, 0, 1))
    expect(time).toBeGreaterThanOrEqual(0)
    expect(time).toBeLessThan(Math.PI * 2000)
  })
})

describe("EdgeGlow", () => {
  it("sans WebGL, garde le repli CSS (pas de `data-live`)", () => {
    const { container } = render(<EdgeGlow />)
    const canvas = container.querySelector('[data-slot="edge-glow"]')
    expect(canvas?.getAttribute("aria-hidden")).toBe("true")
    expect(canvas?.hasAttribute("data-live")).toBe(false)
  })
})
