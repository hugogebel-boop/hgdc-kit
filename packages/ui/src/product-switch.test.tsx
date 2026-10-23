// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FamilyLoaderRoot } from "./family-loader.tsx"

import {
  BACKGROUND_REFRESH_PATH,
  BACKGROUND_REFRESH_TIMEOUT_MS,
  ORG_SYNC_COOKIE,
  PRODUCT_PRERENDER_ATTRIBUTE,
  PRODUCT_SPECULATION_RULES,
  startBackgroundRefresh,
  takeOrgSync,
  takeOrgSyncCookie,
} from "./product-switch.ts"

afterEach(() => {
  cleanup()
  document.cookie = `${ORG_SYNC_COOKIE}=; Path=/; Max-Age=0`
  for (const frame of document.querySelectorAll("iframe")) frame.remove()
  vi.useRealTimers()
})

describe("relecture des organisations en arrière-plan", () => {
  it("sans cookie de l'entrée : rien", () => {
    expect(startBackgroundRefresh()).toBeNull()
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("cookie posé : un seul cadre caché, sans script, vers l'entrée ; le cookie est consommé", () => {
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    const frame = startBackgroundRefresh()
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute("src")).toBe(BACKGROUND_REFRESH_PATH)
    expect(frame?.hidden).toBe(true)
    expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin")
    expect(frame?.getAttribute("aria-hidden")).toBe("true")
    expect(takeOrgSyncCookie()).toBe(false)
    expect(startBackgroundRefresh()).toBeNull()
  })

  it("une autre valeur du cookie ne déclenche rien", () => {
    document.cookie = `${ORG_SYNC_COOKIE}=0; Path=/`
    expect(takeOrgSyncCookie()).toBe(false)
  })

  it("le cadre se retire au chargement ou après le délai", () => {
    vi.useFakeTimers()
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    const loaded = startBackgroundRefresh()
    loaded?.dispatchEvent(new Event("load"))
    expect(loaded?.isConnected).toBe(false)

    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    const stuck = startBackgroundRefresh()
    expect(stuck?.isConnected).toBe(true)
    vi.advanceTimersByTime(BACKGROUND_REFRESH_TIMEOUT_MS)
    expect(stuck?.isConnected).toBe(false)
  })
})

describe("à la racine du document", () => {
  it("FamilyLoaderRoot relit sur toutes les pages, même hors de la coque", () => {
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    render(
      <FamilyLoaderRoot>
        <p>Il te faut une organisation</p>
      </FamilyLoaderRoot>,
    )
    expect(document.querySelectorAll(`iframe[src="${BACKGROUND_REFRESH_PATH}"]`)).toHaveLength(1)
    expect(takeOrgSyncCookie()).toBe(false)
  })
})

describe("produit servi sous un chemin (`app.hgdc.ch/<produit>`)", () => {
  it("le cookie porte la base : le cadre s'ouvre sous elle", () => {
    // happy-dom garde le chemin du cookie : on le pose à la racine pour le lire ici.
    document.cookie = `${ORG_SYNC_COOKIE}=/analytics; Path=/`
    const frame = startBackgroundRefresh()
    expect(frame?.getAttribute("src")).toBe(`/analytics${BACKGROUND_REFRESH_PATH}`)
  })

  it("une valeur qui n'est pas une base ne déclenche rien", () => {
    for (const value of ["/", "//evil.ch", "/..", "/a/../b", "https:", "/a b", "0"]) {
      document.cookie = `${ORG_SYNC_COOKIE}=${value}; Path=/`
      expect(takeOrgSync(), value).toBeNull()
      document.cookie = `${ORG_SYNC_COOKIE}=; Path=/; Max-Age=0`
    }
    document.cookie = `${ORG_SYNC_COOKIE}=/mail/v2; Path=/`
    expect(takeOrgSync()).toBe("/mail/v2")
  })
})

describe("page prérendue au survol", () => {
  it("rien avant l'affichage, la relecture part à l'activation", () => {
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    Object.defineProperty(document, "prerendering", { configurable: true, value: true })
    try {
      expect(startBackgroundRefresh()).toBeNull()
      expect(document.querySelector("iframe")).toBeNull()
      Object.defineProperty(document, "prerendering", { configurable: true, value: false })
      document.dispatchEvent(new Event("prerenderingchange"))
      expect(document.querySelectorAll(`iframe[src="${BACKGROUND_REFRESH_PATH}"]`)).toHaveLength(1)
    } finally {
      delete (document as { prerendering?: boolean }).prerendering
    }
  })
})

describe("règles de spéculation", () => {
  type Rule = { source: string; where: unknown; eagerness: string }
  const rules = JSON.parse(PRODUCT_SPECULATION_RULES) as { prerender: Rule[]; prefetch: Rule[] }

  it("prérendu des seuls liens marqués vers l'entrée d'un produit de la même origine", () => {
    expect(rules.prerender).toEqual([
      {
        source: "document",
        where: {
          and: [
            { selector_matches: `a[${PRODUCT_PRERENDER_ATTRIBUTE}]` },
            { href_matches: "/*/auth/hgdc?refresh=background*" },
          ],
        },
        eagerness: "moderate",
      },
    ])
  })

  it("préchargement seul pour un produit encore sur son sous-domaine", () => {
    expect(rules.prefetch).toEqual([
      {
        source: "document",
        where: { href_matches: "https://*.hgdc.ch/auth/hgdc?refresh=background*" },
        eagerness: "moderate",
      },
    ])
  })

  it.runIf(typeof URLPattern !== "undefined")("les motifs, résolus comme le navigateur", () => {
    const page = "https://app.hgdc.ch/analytics/o/acme"
    const same = new URLPattern("/*/auth/hgdc?refresh=background*", page)
    expect(same.test("https://app.hgdc.ch/mail/auth/hgdc?refresh=background&next=/")).toBe(true)
    // Ni une autre origine, ni l'entrée qui démarre une connexion, ni une autre page.
    expect(same.test("https://mail.hgdc.ch/auth/hgdc?refresh=background&next=/")).toBe(false)
    expect(same.test("https://app.hgdc.ch/mail/auth/hgdc?refresh=1&next=/")).toBe(false)
    expect(same.test("https://app.hgdc.ch/mail/o/acme")).toBe(false)
    const other = new URLPattern("https://*.hgdc.ch/auth/hgdc?refresh=background*")
    expect(other.test("https://status.hgdc.ch/auth/hgdc?refresh=background&next=/")).toBe(true)
    expect(other.test("https://app.hgdc.ch/mail/auth/hgdc?refresh=background&next=/")).toBe(false)
  })
})
