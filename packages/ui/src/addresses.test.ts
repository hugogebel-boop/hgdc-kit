import { describe, expect, it } from "vitest"

import {
  APP_PRODUCTS,
  CONSOLE_ORIGINS,
  isAppProduct,
  normalizeProductBasePath,
  productAddresses,
  productBasePath,
  soloHref,
  soloOrigin,
  viewFromHostname,
  viewOrigin,
} from "./addresses.ts"
import { otherViewHref, PRODUCT_ORIGINS } from "./products.ts"

describe("adresses d'un produit (@hgdc/ui/addresses)", () => {
  it("production : tout se déduit du mot", () => {
    const mail = productAddresses("mail")
    expect(mail).toMatchObject({
      basePath: "/mail",
      appOrigin: "https://app.hgdc.ch",
      appUrl: "https://app.hgdc.ch/mail",
      convexUrl: "https://convex.mail.hgdc.ch",
      convexSiteUrl: "https://actions.mail.hgdc.ch",
    })
    expect(mail.withBase("/o/acme")).toBe("/mail/o/acme")
  })

  it("un produit hors d'app.hgdc.ch reste à la racine de son hôte", () => {
    expect(productAddresses("Account")).toMatchObject({ basePath: "", appUrl: "https://account.hgdc.ch" })
    expect(productAddresses("portal").convexUrl).toBe("https://convex.portal.hgdc.ch")
  })

  it("dans l'app : la base vient du build, un Convex de dev de .env.local", () => {
    const dev = productAddresses("mail", {
      BASE_URL: "/",
      VITE_CONVEX_URL: "https://x-y-1.convex.cloud",
      VITE_CONVEX_SITE_URL: "",
    })
    expect(dev).toMatchObject({ basePath: "", appUrl: "https://mail.hgdc.ch", convexUrl: "https://x-y-1.convex.cloud" })
    expect(dev.convexSiteUrl).toBe("https://actions.mail.hgdc.ch")
    expect(dev.withBase("/o/acme")).toBe("/o/acme")
    expect(productAddresses("mail", { BASE_URL: "/mail/" }).basePath).toBe("/mail")
  })

  it("base du build : /<mot> pour vite build, racine pour vite dev, surcharge d'abord", () => {
    expect(productBasePath("analytics", { command: "build" })).toBe("/analytics")
    expect(productBasePath("analytics")).toBe("/analytics")
    expect(productBasePath("analytics", { command: "serve" })).toBe("")
    expect(productBasePath("status", { override: "/", command: "build" })).toBe("")
    expect(productBasePath("analytics", { override: "/analytics/", command: "serve" })).toBe("/analytics")
    expect(productBasePath("account", { command: "build" })).toBe("")
    expect(productBasePath("status", { override: "", command: "build" })).toBe("/status")
  })

  it("refuse une base ou un mot douteux", () => {
    expect(() => normalizeProductBasePath("//evil.example")).toThrow("base invalide")
    expect(() => normalizeProductBasePath("/a/../b")).toThrow("base invalide")
    expect(() => productAddresses("mail.evil")).toThrow("produit invalide")
  })

  it("PRODUCT_ORIGINS suit APP_PRODUCTS", () => {
    expect(Object.keys(PRODUCT_ORIGINS)).toEqual([...APP_PRODUCTS])
    expect(PRODUCT_ORIGINS["docs"]).toEqual({ origin: "https://app.hgdc.ch", basePath: "/docs" })
    expect(isAppProduct("Status")).toBe(true)
    expect(isAppProduct("portal")).toBe(true)
    expect(isAppProduct("account")).toBe(false)
  })
})

describe("vues d'un produit (ADR 0014)", () => {
  it("deux origines constantes", () => {
    expect(viewOrigin("mail", "seul")).toBe("https://mail.hgdc.ch")
    expect(viewOrigin("mail", "app")).toBe("https://app.hgdc.ch")
  })

  it("la vue du navigateur vient du nom exact de la page", () => {
    expect(viewFromHostname("mail", "mail.hgdc.ch")).toBe("seul")
    expect(viewFromHostname("Mail", "MAIL.hgdc.ch")).toBe("seul")
    for (const host of ["app.hgdc.ch", "mail.hgdc.cloud", "mail.hgdc.ch.evil.ch", "host.hgdc.ch", "localhost"])
      expect(viewFromHostname("mail", host)).toBe("app")
  })

  it("refuse un mot qui fabriquerait un autre hôte", () => {
    expect(() => soloOrigin("evil.ch/x")).toThrow(/produit invalide/)
    expect(() => soloOrigin("")).toThrow(/produit invalide/)
  })

  it("liste fermée des origines des consoles", () => {
    expect(CONSOLE_ORIGINS).toContain("https://app.hgdc.ch")
    expect(CONSOLE_ORIGINS).toContain("https://iassistant.hgdc.ch")
    expect(CONSOLE_ORIGINS).not.toContain("https://account.hgdc.ch")
    expect(CONSOLE_ORIGINS).toHaveLength(APP_PRODUCTS.length + 1)
  })
})

describe("adresse affichée en vue seule (soloHref)", () => {
  it("retire la base sur une frontière de segment", () => {
    expect(soloHref("/mail", "/mail/o/acme?x=1#h")).toBe("/o/acme?x=1#h")
    expect(soloHref("/mail", "/mail")).toBe("/")
    expect(soloHref("/mail", "/mail/")).toBe("/")
    expect(soloHref("/mail", "/mail?x=1")).toBe("/?x=1")
    expect(soloHref("/mail", "/mailbox")).toBe("/mailbox")
    expect(soloHref("/mail", "/o/acme")).toBe("/o/acme")
    expect(soloHref("", "/o/acme")).toBe("/o/acme")
  })

  it("ne fabrique jamais une adresse externe", () => {
    expect(soloHref("/mail", "/mail//evil.ch")).toBe("/mail//evil.ch")
    expect(soloHref("/mail", "/mail/\\evil.ch")).toBe("/mail/\\evil.ch")
  })
})

describe("lien vers l'autre vue (otherViewHref)", () => {
  it("passe par l'entrée de l'autre origine, chemin encodé", () => {
    expect(otherViewHref("mail", "app", "/o/acme?x=1")).toBe("https://mail.hgdc.ch/auth/hgdc?next=%2Fo%2Facme%3Fx%3D1")
    expect(otherViewHref("Mail", "seul", "/o/acme")).toBe("https://app.hgdc.ch/mail/auth/hgdc?next=%2Fo%2Facme")
  })

  it("un chemin douteux mène à l'accueil", () => {
    for (const path of ["//evil.ch", "https://evil.ch", "/\\evil.ch", "evil"])
      expect(otherViewHref("mail", "app", path)).toBe("https://mail.hgdc.ch/auth/hgdc?next=%2F")
  })

  it("Account n'a qu'une vue", () => {
    expect(otherViewHref("account", "app")).toBeNull()
  })
})
