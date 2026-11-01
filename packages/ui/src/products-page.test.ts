import { describe, expect, it } from "vitest"

import { HGDC_PRODUCTS, productMenuEntries, productRailEntries } from "./products.ts"

describe("page produit sur le site (productPage)", () => {
  it("déduit l'adresse du mot pour chaque produit ouvert", () => {
    const host = HGDC_PRODUCTS.find((item) => item.word === "Host")
    expect(host?.productPage).toBe("https://hgdc.ch/h-collection/host")
    for (const item of HGDC_PRODUCTS.filter((p) => p.stage !== "soon")) {
      expect(item.productPage).toBe(`https://hgdc.ch/h-collection/${item.badge}`)
    }
  })

  it("ne donne aucun lien à un produit « soon »", () => {
    for (const item of HGDC_PRODUCTS.filter((p) => p.stage === "soon")) expect(item.productPage).toBeUndefined()
  })
})

describe("ID", () => {
  const id = HGDC_PRODUCTS.find((item) => item.word === "ID")

  it("est un produit en service, servi à id.hgdc.ch, entrée à sa racine", () => {
    expect(id).toMatchObject({
      stage: "live",
      badge: "id",
      href: "https://id.hgdc.ch",
      entryHref: "https://id.hgdc.ch",
      productPage: "https://hgdc.ch/h-collection/id",
    })
  })

  it("apparaît dans le menu et la barre des produits", () => {
    expect(productMenuEntries().some((entry) => entry.badge === "id" && entry.href === "https://id.hgdc.ch")).toBe(true)
    expect(productRailEntries().products.some((entry) => entry.badge === "id")).toBe(true)
  })
})
