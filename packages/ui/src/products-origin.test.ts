import { describe, expect, it } from "vitest"

import { HGDC_PRODUCTS, PRODUCT_ORIGINS, productEntryHref, productMenuEntries, productOrigin } from "./products.ts"

describe("adresses des produits (PRODUCT_ORIGINS)", () => {
  it("par défaut : le sous-domaine du produit, sans base", () => {
    expect(productOrigin("Docs", {})).toEqual({ origin: "https://docs.hgdc.ch", basePath: "" })
    expect(productEntryHref("docs", {})).toBe("https://docs.hgdc.ch/auth/hgdc?refresh=background&next=/")
    expect(Object.keys(PRODUCT_ORIGINS).every((word) => word === word.toLowerCase())).toBe(true)
  })

  it("la table active la nouvelle adresse produit par produit", () => {
    const origins = { analytics: { origin: "https://app.hgdc.ch", basePath: "/analytics" } }
    expect(productEntryHref("Analytics", origins)).toBe(
      "https://app.hgdc.ch/analytics/auth/hgdc?refresh=background&next=/",
    )
    expect(productEntryHref("Mail", origins)).toBe("https://mail.hgdc.ch/auth/hgdc?refresh=background&next=/")
  })

  it("une clé héritée de Object ne passe pas pour un produit", () => {
    expect(productOrigin("constructor")).toEqual({ origin: "https://constructor.hgdc.ch", basePath: "" })
  })

  it("le catalogue livré suit la table et garde la page d'accueil publique", () => {
    for (const item of HGDC_PRODUCTS) {
      expect(item.href).toBe(`https://${item.badge}.hgdc.ch`)
      expect(item.entryHref).toBe(productEntryHref(item.badge))
    }
    expect(productMenuEntries().length).toBeGreaterThan(0)
  })
})
