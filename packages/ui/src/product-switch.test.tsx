// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FamilyLoaderRoot } from "./family-loader.tsx"

import {
  BACKGROUND_REFRESH_INTERVAL_MS,
  BACKGROUND_REFRESH_PATH,
  BACKGROUND_REFRESH_TIMEOUT_MS,
  ORG_SYNC_COOKIE,
  ORG_SYNC_LAST_KEY_PREFIX,
  PRODUCT_PRERENDER_ATTRIBUTE,
  PRODUCT_SPECULATION_RULES,
  productEntryBase,
  SESSION_OPEN_INTERVAL_MS,
  SESSION_OPEN_KEY_PREFIX,
  SESSION_OPEN_PATH,
  startBackgroundRefresh,
  startSessionOpening,
  takeOrgSync,
  takeOrgSyncCookie,
} from "./product-switch.ts"

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.cookie = `${ORG_SYNC_COOKIE}=; Path=/; Max-Age=0`
  for (const frame of document.querySelectorAll("iframe")) frame.remove()
  vi.useRealTimers()
})

describe("ouverture des sessions des autres modules (ADR 0026)", () => {
  const frames = () => [...document.querySelectorAll("iframe")].map((frame) => frame.getAttribute("src"))

  it("un cadre caché, sans script, à la fois, vers l'entrée `frame=open` de chaque module", () => {
    startSessionOpening(["/mail", "/status"])
    expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
    const first = document.querySelector("iframe")
    expect(first?.getAttribute("sandbox")).toBe("allow-same-origin")
    expect(first?.hidden).toBe(true)
    first?.dispatchEvent(new Event("load"))
    expect(frames()).toEqual([`/status${SESSION_OPEN_PATH}`])
    document.querySelector("iframe")?.dispatchEvent(new Event("load"))
    expect(frames()).toEqual([])
  })

  it("au plus une fois par jour et par module", () => {
    startSessionOpening(["/mail"])
    document.querySelector("iframe")?.dispatchEvent(new Event("load"))
    startSessionOpening(["/mail"])
    expect(frames()).toEqual([])
    localStorage.setItem(`${SESSION_OPEN_KEY_PREFIX}/mail`, String(Date.now() - SESSION_OPEN_INTERVAL_MS - 1))
    startSessionOpening(["/mail"])
    expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
  })

  it("arrêtée : le module suivant ne part pas", () => {
    const stop = startSessionOpening(["/mail", "/status"])
    stop()
    document.querySelector("iframe")?.dispatchEvent(new Event("load"))
    expect(frames()).toEqual([])
  })

  it("rien sur une page prérendue", () => {
    Object.defineProperty(document, "prerendering", { value: true, configurable: true })
    startSessionOpening(["/mail"])
    expect(frames()).toEqual([])
    Reflect.deleteProperty(document, "prerendering")
  })

  it("base d'un lien de la barre : relatif seulement", () => {
    expect(productEntryBase("/mail/auth/hgdc?refresh=background&next=%2F")).toBe("/mail")
    expect(productEntryBase("https://status.hgdc.ch/auth/hgdc?refresh=background")).toBeNull()
    expect(productEntryBase("/auth/hgdc?refresh=background")).toBeNull()
    expect(productEntryBase("//evil.ch/auth/hgdc")).toBeNull()
  })
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

    localStorage.clear()
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    const stuck = startBackgroundRefresh()
    expect(stuck?.isConnected).toBe(true)
    vi.advanceTimersByTime(BACKGROUND_REFRESH_TIMEOUT_MS)
    expect(stuck?.isConnected).toBe(false)
  })
})

describe("au plus une relecture par produit toutes les 10 minutes", () => {
  it("passages répétés : relu une fois, puis de nouveau après le délai ; chaque produit a son délai", () => {
    vi.useFakeTimers()
    const visit = (base: string) => {
      document.cookie = `${ORG_SYNC_COOKIE}=${base || "1"}; Path=/`
      const frame = startBackgroundRefresh()
      frame?.remove()
      return frame !== null
    }
    expect(visit("/host")).toBe(true)
    expect(visit("/host")).toBe(false)
    expect(visit("/mail")).toBe(true)
    vi.advanceTimersByTime(BACKGROUND_REFRESH_INTERVAL_MS - 1)
    expect(visit("/host")).toBe(false)
    vi.advanceTimersByTime(1)
    expect(visit("/host")).toBe(true)
  })

  it("heure enregistrée illisible ou dans le futur : la relecture part", () => {
    localStorage.setItem(`${ORG_SYNC_LAST_KEY_PREFIX}/`, "abc")
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    expect(startBackgroundRefresh()).not.toBeNull()
    localStorage.setItem(`${ORG_SYNC_LAST_KEY_PREFIX}/`, String(Date.now() + 60_000))
    document.cookie = `${ORG_SYNC_COOKIE}=1; Path=/`
    expect(startBackgroundRefresh()).not.toBeNull()
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
