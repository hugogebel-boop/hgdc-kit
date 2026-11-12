// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  SESSION_CHECK_PATH,
  SESSION_OPEN_INTERVAL_MS,
  SESSION_OPEN_KEY_PREFIX,
  SESSION_OPEN_PATH,
  SESSION_OPEN_PAUSED_KEY,
  pauseSessionOpening,
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
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const loadFrame = async () => {
    document.querySelector("iframe")?.dispatchEvent(new Event("load"))
    await settle()
  }
  /** Réponse de `get-session` par base ; une base absente répond `null` (pas de session). */
  const sessions = (replies: Record<string, Response | Error> = {}) =>
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString()
      const reply = replies[url.slice(0, url.indexOf(SESSION_CHECK_PATH))]
      if (reply instanceof Error) throw reply
      return reply ?? Response.json(null)
    })
  const open = () => Response.json({ session: { id: "s" }, user: { id: "u" } })

  beforeEach(() => {
    sessions()
  })
  afterEach(() => vi.restoreAllMocks())

  it("un cadre caché, sans script, à la fois, vers l'entrée `frame=open` de chaque module sans session", async () => {
    startSessionOpening(["/mail", "/status"])
    await settle()
    expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
    const first = document.querySelector("iframe")
    expect(first?.getAttribute("sandbox")).toBe("allow-same-origin")
    expect(first?.hidden).toBe(true)
    await loadFrame()
    expect(frames()).toEqual([`/status${SESSION_OPEN_PATH}`])
    await loadFrame()
    expect(frames()).toEqual([])
  })

  it("session déjà ouverte : aucun cadre, la limite du jour est marquée, le module suivant part", async () => {
    const fetch = sessions({ "/mail": open() })
    startSessionOpening(["/mail", "/status"])
    await settle()
    expect(fetch).toHaveBeenCalledWith(
      `/mail${SESSION_CHECK_PATH}`,
      expect.objectContaining({ credentials: "include" }),
    )
    expect(frames()).toEqual([`/status${SESSION_OPEN_PATH}`])
    expect(localStorage.getItem(`${SESSION_OPEN_KEY_PREFIX}/mail`)).not.toBeNull()
  })

  it("lecture en échec : aucun cadre, la limite n'est pas consommée", async () => {
    sessions({ "/mail": new Response(null, { status: 500 }), "/status": new Error("réseau") })
    startSessionOpening(["/mail", "/status"])
    await settle()
    expect(frames()).toEqual([])
    expect(localStorage.getItem(`${SESSION_OPEN_KEY_PREFIX}/mail`)).toBeNull()
    expect(localStorage.getItem(`${SESSION_OPEN_KEY_PREFIX}/status`)).toBeNull()
  })

  it("au plus une fois par jour et par module, sans relire la session", async () => {
    startSessionOpening(["/mail"])
    await settle()
    await loadFrame()
    const fetch = sessions()
    fetch.mockClear()
    startSessionOpening(["/mail"])
    await settle()
    expect(frames()).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    localStorage.setItem(`${SESSION_OPEN_KEY_PREFIX}/mail`, String(Date.now() - SESSION_OPEN_INTERVAL_MS - 1))
    startSessionOpening(["/mail"])
    await settle()
    expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
  })

  it("arrêtée : le module suivant ne part pas", async () => {
    const stop = startSessionOpening(["/mail", "/status"])
    await settle()
    stop()
    await loadFrame()
    expect(frames()).toEqual([])
  })

  it("arrêtée pendant une lecture : rien ne part", async () => {
    const stop = startSessionOpening(["/mail"])
    stop()
    await settle()
    expect(frames()).toEqual([])
  })

  it("après une déconnexion : rien ne s'ouvre jusqu'à la prochaine connexion", async () => {
    pauseSessionOpening()
    startSessionOpening(["/mail"])
    await settle()
    expect(frames()).toEqual([])
    localStorage.removeItem(SESSION_OPEN_PAUSED_KEY)
    startSessionOpening(["/mail"])
    await settle()
    expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
  })

  it("déconnexion pendant une lecture : aucun cadre, la limite n'est pas consommée", async () => {
    startSessionOpening(["/mail"])
    pauseSessionOpening()
    await settle()
    expect(frames()).toEqual([])
    expect(localStorage.getItem(`${SESSION_OPEN_KEY_PREFIX}/mail`)).toBeNull()
  })

  it("déconnexion pendant la file : le cadre en vol est retiré et le module suivant ne part pas", async () => {
    startSessionOpening(["/mail", "/status", "/docs"])
    await settle()
    const inFlight = document.querySelector("iframe")
    expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
    pauseSessionOpening()
    expect(frames()).toEqual([])
    expect(inFlight?.isConnected).toBe(false)
    // Son chargement (ou son délai) ne relance pas la file.
    inFlight?.dispatchEvent(new Event("load"))
    await settle()
    expect(frames()).toEqual([])
  })

  it("déconnexion venue d'un autre onglet entre deux cadres : la file s'arrête", async () => {
    startSessionOpening(["/mail", "/status"])
    await settle()
    localStorage.setItem(SESSION_OPEN_PAUSED_KEY, String(Date.now()))
    await loadFrame()
    expect(frames()).toEqual([])
  })

  it("la déconnexion ne retire que les cadres d'ouverture", async () => {
    const other = document.createElement("iframe")
    document.body.append(other)
    startSessionOpening(["/mail"])
    await settle()
    pauseSessionOpening()
    expect(other.isConnected).toBe(true)
    expect(frames()).toEqual([null])
  })

  it("stockage refusé : rien ne part (aucune limite par jour sans lui)", async () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("refusé")
    })
    startSessionOpening(["/mail"])
    await settle()
    expect(frames()).toEqual([])
    spy.mockRestore()
  })

  it("rien sur une page prérendue", async () => {
    Object.defineProperty(document, "prerendering", { value: true, configurable: true })
    startSessionOpening(["/mail"])
    await settle()
    expect(frames()).toEqual([])
    Reflect.deleteProperty(document, "prerendering")
  })

  describe("selon la session du module ouvert", () => {
    it("session ouverte : la file part, après avoir lu la session du module ouvert", async () => {
      const fetch = sessions({ "/iassistant": open() })
      startSessionOpening(["/mail"], document, "/iassistant")
      await settle()
      expect(fetch).toHaveBeenCalledWith(`/iassistant${SESSION_CHECK_PATH}`, expect.anything())
      expect(frames()).toEqual([`/mail${SESSION_OPEN_PATH}`])
    })

    it("démo sans session : rien ne part, et la limite par jour n'est pas consommée", async () => {
      startSessionOpening(["/mail", "/status"], document, "/iassistant")
      await settle()
      expect(frames()).toEqual([])
      expect(localStorage.getItem(`${SESSION_OPEN_KEY_PREFIX}/mail`)).toBeNull()
    })

    it("lecture en échec : rien ne part", async () => {
      sessions({ "/iassistant": new Response(null, { status: 500 }) })
      startSessionOpening(["/mail"], document, "/iassistant")
      await settle()
      expect(frames()).toEqual([])
      sessions({ "/iassistant": new Error("réseau") })
      startSessionOpening(["/mail"], document, "/iassistant")
      await settle()
      expect(frames()).toEqual([])
    })
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
