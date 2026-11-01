import { describe, expect, it } from "vitest"

import {
  HGDC_PRODUCTS,
  PRODUCT_ORIGINS,
  productEntryHref,
  productMenuEntries,
  productOrigin,
  productRailEntries,
  sameOriginPath,
} from "./products.ts"

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
      // ID n’a pas d’entrée `/auth/hgdc` : sa racine.
      expect(item.entryHref).toBe(item.badge === "id" ? item.href : productEntryHref(item.badge))
    }
    expect(productMenuEntries().length).toBeGreaterThan(0)
  })
})

describe("barre des produits sous une origine partagée (ADR 0020)", () => {
  const APP = "https://app.hgdc.ch"

  it("sameOriginPath : le chemin sous la même origine, sinon null", () => {
    expect(sameOriginPath(`${APP}/mail/auth/hgdc?refresh=background&next=/`, APP)).toBe(
      "/mail/auth/hgdc?refresh=background&next=/",
    )
    expect(sameOriginPath("https://status.hgdc.ch/auth/hgdc", APP)).toBeNull()
    expect(sameOriginPath(`${APP}/mail/`, undefined)).toBeNull()
    expect(sameOriginPath("pas une adresse", APP)).toBeNull()
  })

  it("depuis app.hgdc.ch : liens relatifs et marqués pour les produits servis là, absolus ailleurs", () => {
    const { products, account } = productRailEntries({ current: "analytics", pageOrigin: APP })
    const by = Object.fromEntries(products.map((entry) => [entry.badge, entry]))
    expect(by.mail).toMatchObject({ href: "/mail/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    expect(by.host).toMatchObject({ href: "/host/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    expect(by.status).toMatchObject({ href: "/status/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    expect(by.portal).toMatchObject({ href: "/portal/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    // Le produit courant : sa racine sous sa base, sans détour par l'entrée, jamais marqué.
    expect(by.analytics).toMatchObject({ href: "/analytics/", current: true })
    expect(by.analytics?.sameOrigin).toBeUndefined()
    expect(account).toMatchObject({ href: "https://account.hgdc.ch" })
    expect(account.sameOrigin).toBeUndefined()
  })

  it("au rendu serveur ou sur une autre origine (développement) : comme avant", () => {
    for (const pageOrigin of [undefined, "http://localhost:3300"]) {
      const { products } = productRailEntries({ current: "mail", pageOrigin })
      const by = Object.fromEntries(products.map((entry) => [entry.badge, entry]))
      expect(by.mail).toMatchObject({ href: "/", current: true })
      expect(by.host?.href).toBe(productEntryHref("host"))
      expect(products.some((entry) => entry.sameOrigin)).toBe(false)
    }
  })

  it("depuis un produit sur son sous-domaine : la racine du produit courant reste /", () => {
    const { products } = productRailEntries({ current: "status", pageOrigin: "https://status.hgdc.ch" })
    expect(products.find((entry) => entry.badge === "status")).toMatchObject({ href: "/", current: true })
    expect(products.some((entry) => entry.sameOrigin)).toBe(false)
  })
})
