import { describe, expect, it } from "vitest"

import { APP_PRODUCTS, isAppProduct, normalizeProductBasePath, productAddresses, productBasePath } from "./addresses.ts"
import { PRODUCT_ORIGINS } from "./products.ts"

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
