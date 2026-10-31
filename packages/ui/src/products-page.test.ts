import { describe, expect, it } from "vitest"

import { HGDC_PRODUCTS } from "./products.ts"

describe("page produit sur le site (productPage)", () => {
  it("déduit l'adresse du mot pour chaque produit ouvert", () => {
    const host = HGDC_PRODUCTS.find((item) => item.word === "Host")
    expect(host?.productPage).toBe("https://hgdc.ch/h-collection/host")
    for (const item of HGDC_PRODUCTS.filter((p) => p.stage !== "soon")) {
      expect(item.productPage).toBe(`https://hgdc.ch/h-collection/${item.badge}`)
    }
  })

  it("ne donne aucun lien à un produit « soon »", () => {
    const soon = HGDC_PRODUCTS.filter((item) => item.stage === "soon")
    expect(soon.length).toBeGreaterThan(0)
    for (const item of soon) expect(item.productPage).toBeUndefined()
  })
})
