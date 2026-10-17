// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FamilyLoaderRoot } from "./family-loader.tsx"

import {
  BACKGROUND_REFRESH_PATH,
  BACKGROUND_REFRESH_TIMEOUT_MS,
  ORG_SYNC_COOKIE,
  PRODUCT_PREFETCH_RULES,
  startBackgroundRefresh,
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

describe("préchargement au survol", () => {
  it("préchargement seulement, de l'entrée `refresh=background` des produits", () => {
    const rules = JSON.parse(PRODUCT_PREFETCH_RULES) as Record<string, unknown>
    expect(Object.keys(rules)).toEqual(["prefetch"])
    expect(PRODUCT_PREFETCH_RULES).not.toContain("prerender")
    expect(PRODUCT_PREFETCH_RULES).toContain("https://*.hgdc.ch/auth/hgdc?refresh=background*")
  })
})
