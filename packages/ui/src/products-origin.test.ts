import { describe, expect, it } from "vitest"

import {
  HGDC_PRODUCTS,
  PRODUCT_ORIGINS,
  productEntryHref,
  productMenuEntries,
  productOrigin,
  shellProductEntries,
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
    const { products, account } = shellProductEntries({ current: "docs", pageOrigin: APP })
    const by = Object.fromEntries(products.map((entry) => [entry.badge, entry]))
    expect(by.mail).toMatchObject({ href: "/mail/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    expect(by.host).toMatchObject({ href: "/host/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    expect(by.status).toMatchObject({ href: "/status/auth/hgdc?refresh=background&next=/", sameOrigin: true })
    expect(by.portal).toBeUndefined()
    // Le produit courant : sa racine sous sa base, sans détour par l'entrée, jamais marqué.
    expect(by.docs).toMatchObject({ href: "/docs/", current: true })
    expect(by.docs?.sameOrigin).toBeUndefined()
    // Statistiques vit dans Manager : son entrée passe par son ancien nom, que la passerelle renvoie.
    expect(by.analytics).toMatchObject({ href: "https://analytics.hgdc.ch/auth/hgdc?refresh=background&next=/" })
    expect(account).toMatchObject({
      name: "Manager",
      href: "/manager/auth/hgdc?refresh=background&next=/",
      sameOrigin: true,
    })
  })

  it("dernière organisation connue : l'entrée mène droit à /o/<organisation>, Manager garde l'accueil", () => {
    const { products, account } = shellProductEntries({ current: "docs", pageOrigin: APP, organization: "hgdc" })
    const by = Object.fromEntries(products.map((entry) => [entry.badge, entry]))
    expect(by.mail).toMatchObject({ href: "/mail/auth/hgdc?refresh=background&next=%2Fo%2Fhgdc", sameOrigin: true })
    expect(by.host?.href).toBe("/host/auth/hgdc?refresh=background&next=%2Fo%2Fhgdc")
    expect(by.docs).toMatchObject({ href: "/docs/", current: true })
    expect(account.href).toBe("/manager/auth/hgdc?refresh=background&next=/")
  })

  it("slug d'organisation inattendu : rien ne part dans next", () => {
    for (const organization of ["~demo", "../x", "a/b", "", "A", "x".repeat(64), null])
      expect(productEntryHref("mail", PRODUCT_ORIGINS, organization)).toBe(productEntryHref("mail"))
    expect(productEntryHref("manager", PRODUCT_ORIGINS, "hgdc")).toBe(productEntryHref("manager"))
  })

  it("au rendu serveur ou sur une autre origine (développement) : comme avant", () => {
    for (const pageOrigin of [undefined, "http://localhost:3300"]) {
      const { products } = shellProductEntries({ current: "mail", pageOrigin })
      const by = Object.fromEntries(products.map((entry) => [entry.badge, entry]))
      expect(by.mail).toMatchObject({ href: "/", current: true })
      expect(by.host?.href).toBe(productEntryHref("host"))
      expect(products.some((entry) => entry.sameOrigin)).toBe(false)
    }
  })

  it("depuis un produit sur son sous-domaine : la racine du produit courant reste /", () => {
    const { products } = shellProductEntries({ current: "status", pageOrigin: "https://status.hgdc.ch" })
    expect(products.find((entry) => entry.badge === "status")).toMatchObject({ href: "/", current: true })
    expect(products.some((entry) => entry.sameOrigin)).toBe(false)
  })
})
