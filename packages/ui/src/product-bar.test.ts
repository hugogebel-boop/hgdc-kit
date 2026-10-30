// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_PREFERENCES_URL,
  parseProductBar,
  productBarShown,
  rememberProductBar,
  syncProductBar,
} from "./product-bar.ts"

describe("réglage « Barre des produits » (ADR 0014)", () => {
  beforeEach(() => window.localStorage.clear())

  it("automatique : selon l'adresse", () => {
    expect(productBarShown("app", "auto")).toBe(true)
    expect(productBarShown("seul", "auto")).toBe(false)
    expect(productBarShown("seul", "always")).toBe(true)
    expect(productBarShown("app", "never")).toBe(false)
  })

  it("une valeur inconnue vaut automatique", () => {
    for (const value of [undefined, null, "", "ALWAYS", 1, {}]) expect(parseProductBar(value)).toBe("auto")
  })

  it("relit Account avec son cookie et retient la valeur", async () => {
    const fetchImpl = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({ productBar: "never" }),
    )
    await syncProductBar(fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledWith(ACCOUNT_PREFERENCES_URL, { credentials: "include", cache: "no-store" })
    expect(window.localStorage.getItem("hgdc-product-bar")).toBe("never")
  })

  it("Account injoignable ou en erreur : la dernière valeur reste", async () => {
    rememberProductBar("always")
    await syncProductBar((async () => new Response("", { status: 500 })) as unknown as typeof fetch)
    await syncProductBar((async () => {
      throw new TypeError("réseau")
    }) as unknown as typeof fetch)
    expect(window.localStorage.getItem("hgdc-product-bar")).toBe("always")
  })

  it("automatique ne laisse rien dans le stockage", () => {
    rememberProductBar("never")
    rememberProductBar("auto")
    expect(window.localStorage.getItem("hgdc-product-bar")).toBeNull()
  })
})
