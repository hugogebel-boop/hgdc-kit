import { describe, expect, it } from "vitest"

import {
  HGDC_ENTRY_PATH,
  hasSyncedMarker,
  hgdcEntryUrl,
  hgdcRefreshPath,
  safeNextPath,
  withSyncedMarker,
  withoutSyncedMarker,
} from "./index.ts"
import { createHgdcEntry } from "./server.ts"

describe("safeNextPath", () => {
  it("garde un chemin du produit, avec sa requête", () => {
    expect(safeNextPath("/o/acme")).toBe("/o/acme")
    expect(safeNextPath("/o/acme/sites?tri=nom#haut")).toBe("/o/acme/sites?tri=nom#haut")
    expect(safeNextPath("/")).toBe("/")
  })

  it("refuse toute autre origine : pas de redirection ouverte", () => {
    for (const value of [
      "https://evil.ch",
      "//evil.ch",
      "//evil.ch/o",
      "/\\evil.ch",
      "\\\\evil.ch",
      "/o\\..\\..\\evil",
      "javascript:alert(1)",
      "evil.ch/o",
      "o/acme",
      "/\tevil",
      "/o\r\nset-cookie:x",
      " /o",
      "",
      `/${"a".repeat(3000)}`,
    ])
      expect(safeNextPath(value), value).toBe("/")
  })

  it("normalise un chemin qui remonte sans sortir de l'origine", () => {
    expect(safeNextPath("/a/../../b")).toBe("/b")
    expect(safeNextPath("/%2F%2Fevil.ch")).toBe("/%2F%2Fevil.ch")
  })

  it("refuse l'entrée elle-même et better-auth (boucle)", () => {
    expect(safeNextPath(HGDC_ENTRY_PATH)).toBe("/")
    expect(safeNextPath(`${HGDC_ENTRY_PATH}/?next=/x`)).toBe("/")
    expect(safeNextPath("/api/auth/sign-out")).toBe("/")
    expect(safeNextPath("/api/authentique")).toBe("/api/authentique")
  })

  it("rend la valeur de repli choisie", () => {
    expect(safeNextPath(null, "/dashboard")).toBe("/dashboard")
    expect(safeNextPath(undefined)).toBe("/")
  })
})

describe("hgdcEntryUrl", () => {
  it("construit l'adresse de l'entrée d'un produit", () => {
    expect(hgdcEntryUrl("https://mail.hgdc.ch")).toBe("https://mail.hgdc.ch/auth/hgdc")
    expect(hgdcEntryUrl("https://mail.hgdc.ch/ignore?x=1", "/o/acme")).toBe(
      "https://mail.hgdc.ch/auth/hgdc?next=%2Fo%2Facme",
    )
    expect(hgdcEntryUrl("https://mail.hgdc.ch", "https://evil.ch")).toBe("https://mail.hgdc.ch/auth/hgdc")
  })

  it("avec `refresh`, relit les organisations et porte toujours `next`", () => {
    expect(hgdcEntryUrl("https://host.hgdc.ch", undefined, { refresh: true })).toBe(
      "https://host.hgdc.ch/auth/hgdc?refresh=1&next=%2F",
    )
    expect(hgdcEntryUrl("https://host.hgdc.ch", "/o/acme", { refresh: true })).toBe(
      "https://host.hgdc.ch/auth/hgdc?refresh=1&next=%2Fo%2Facme",
    )
  })
})

describe("marqueur de resynchronisation", () => {
  it("hgdcRefreshPath : chemin relatif, `next` filtré et sans marqueur", () => {
    expect(hgdcRefreshPath("/o/acme")).toBe("/auth/hgdc?refresh=1&next=%2Fo%2Facme")
    expect(hgdcRefreshPath("/o/acme?synced=1")).toBe("/auth/hgdc?refresh=1&next=%2Fo%2Facme")
    expect(hgdcRefreshPath("https://evil.ch")).toBe("/auth/hgdc?refresh=1&next=%2F")
  })

  it("pose et retire `synced=1` sans toucher au reste", () => {
    expect(withSyncedMarker("/o/acme")).toBe("/o/acme?synced=1")
    expect(withSyncedMarker("/o/acme?tab=dns#haut")).toBe("/o/acme?tab=dns&synced=1#haut")
    expect(withSyncedMarker("/o/acme?synced=1")).toBe("/o/acme?synced=1")
    expect(withoutSyncedMarker("/o/acme?synced=1")).toBe("/o/acme")
    expect(withoutSyncedMarker("/o/acme?tab=dns&synced=1#haut")).toBe("/o/acme?tab=dns#haut")
  })

  it("hasSyncedMarker lit une requête, une adresse ou des paramètres", () => {
    expect(hasSyncedMarker("?synced=1")).toBe(true)
    expect(hasSyncedMarker("synced=1")).toBe(true)
    expect(hasSyncedMarker("/o/acme?synced=1#x")).toBe(true)
    expect(hasSyncedMarker(new URLSearchParams({ synced: "1" }))).toBe(true)
    expect(hasSyncedMarker("?synced=0")).toBe(false)
    expect(hasSyncedMarker("")).toBe(false)
  })
})

type Call = { url: string; method: string; headers: Headers; body: string }

function fakeAuth(handlers: { session?: () => Response; signIn?: (call: Call) => Response }): {
  calls: Call[]
  proxy: (request: Request) => Promise<Response>
} {
  const calls: Call[] = []
  return {
    calls,
    proxy: async (request) => {
      const call = { url: request.url, method: request.method, headers: request.headers, body: await request.text() }
      calls.push(call)
      const path = new URL(request.url).pathname
      if (path === "/api/auth/get-session") return handlers.session?.() ?? Response.json(null)
      if (path === "/api/auth/sign-in/oauth2")
        return handlers.signIn?.(call) ?? new Response("not found", { status: 404 })
      return new Response("not found", { status: 404 })
    },
  }
}

function json(body: unknown, cookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json" })
  for (const cookie of cookies) headers.append("set-cookie", cookie)
  return new Response(JSON.stringify(body), { headers })
}

const AUTHORIZE = "https://account.hgdc.ch/api/auth/oauth2/authorize?client_id=mail&state=s"

function visit(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://mail.hgdc.ch${path}`, {
    headers: {
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-site",
      "x-forwarded-for": "203.0.113.7",
      ...headers,
    },
  })
}

describe("createHgdcEntry", () => {
  it("refuse une page d'erreur hors du produit", () => {
    const { proxy } = fakeAuth({})
    expect(() => createHgdcEntry({ proxy, errorCallbackURL: "https://evil.ch" })).toThrow(/errorCallbackURL/)
  })

  it("sans session : part vers Account avec retour sur `next`, cookies d'état transmis", async () => {
    const { calls, proxy } = fakeAuth({
      signIn: () => json({ url: AUTHORIZE, redirect: true }, ["__Secure-better-auth.state=abc; Path=/; HttpOnly"]),
    })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })
    const response = await entry(visit("/auth/hgdc?next=%2Fo%2Facme"))

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(AUTHORIZE)
    expect(response.headers.getSetCookie()).toEqual(["__Secure-better-auth.state=abc; Path=/; HttpOnly"])
    expect(response.headers.get("cache-control")).toBe("no-store")

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call?.method).toBe("POST")
    expect(call?.url).toBe("https://mail.hgdc.ch/api/auth/sign-in/oauth2")
    expect(JSON.parse(call?.body ?? "")).toEqual({
      providerId: "hgdc",
      callbackURL: "/o/acme",
      errorCallbackURL: "/sign-in?error=1",
    })
    expect(call?.headers.get("origin")).toBe("https://mail.hgdc.ch")
    expect(call?.headers.get("sec-fetch-mode")).toBeNull()
    expect(call?.headers.get("x-forwarded-for")).toBe("203.0.113.7")
  })

  it("session du produit ouverte : va droit à `next`", async () => {
    const { calls, proxy } = fakeAuth({ session: () => json({ session: { id: "s" }, user: { id: "u" } }) })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })
    const response = await entry(
      visit("/auth/hgdc?next=/dashboard", { cookie: "__Secure-better-auth.session_token=t" }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/dashboard")
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/auth/get-session"])
    expect(calls[0]?.headers.get("cookie")).toBe("__Secure-better-auth.session_token=t")
  })

  it("cookie présent mais session expirée : démarre la connexion", async () => {
    const { calls, proxy } = fakeAuth({ signIn: () => json({ url: AUTHORIZE, redirect: true }) })
    const response = await createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })(
      visit("/auth/hgdc", { cookie: "old=1" }),
    )
    expect(response.headers.get("location")).toBe(AUTHORIZE)
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/auth/get-session", "/api/auth/sign-in/oauth2"])
    expect(JSON.parse(calls[1]?.body ?? "").callbackURL).toBe("/")
  })

  it("`refresh=1` avec une session ouverte : repart vers Account, retour marqué `synced=1`", async () => {
    const { calls, proxy } = fakeAuth({
      session: () => json({ session: { id: "s" }, user: { id: "u" } }),
      signIn: () => json({ url: AUTHORIZE, redirect: true }),
    })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })
    const response = await entry(
      visit("/auth/hgdc?refresh=1&next=%2Fo%2Fbeta", { cookie: "__Secure-better-auth.session_token=t" }),
    )
    expect(response.headers.get("location")).toBe(AUTHORIZE)
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/auth/sign-in/oauth2"])
    expect(JSON.parse(calls[0]?.body ?? "").callbackURL).toBe("/o/beta?synced=1")
  })

  it("`refresh=1` sur un `next` déjà resynchronisé : pas de seconde boucle", async () => {
    const { calls, proxy } = fakeAuth({ session: () => json({ session: { id: "s" } }) })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })
    const response = await entry(
      visit(`/auth/hgdc?refresh=1&next=${encodeURIComponent("/o/beta?synced=1")}`, { cookie: "s=1" }),
    )
    expect(response.headers.get("location")).toBe("/o/beta?synced=1")
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/auth/get-session"])
  })

  it("`refresh=1` avec un `next` externe : retour sur l'accueil du produit", async () => {
    const { calls, proxy } = fakeAuth({ signIn: () => json({ url: AUTHORIZE }) })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })
    await entry(visit(`/auth/hgdc?refresh=1&next=${encodeURIComponent("//evil.ch")}`, { cookie: "s=1" }))
    expect(JSON.parse(calls[0]?.body ?? "").callbackURL).toBe("/?synced=1")
  })

  it("`next` externe : remplacé par l'accueil du produit, jamais suivi", async () => {
    const { calls, proxy } = fakeAuth({ session: () => json({ session: { id: "s" } }) })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/sign-in?error=1" })
    for (const next of ["https://evil.ch", "//evil.ch", "/\\evil.ch"]) {
      const response = await entry(visit(`/auth/hgdc?next=${encodeURIComponent(next)}`, { cookie: "s=1" }))
      expect(response.headers.get("location")).toBe("/")
    }
    expect(calls).toHaveLength(3)
  })

  it("better-auth refuse ou rend une adresse douteuse : page d'erreur du produit", async () => {
    for (const signIn of [
      () => new Response("{}", { status: 400 }),
      () => json({ url: "javascript:alert(1)" }),
      () => json({}),
      () => new Response("pas du json"),
    ]) {
      const { proxy } = fakeAuth({ signIn })
      const response = await createHgdcEntry({ proxy, errorCallbackURL: "/connexion?erreur=hgdc" })(visit("/auth/hgdc"))
      expect(response.status).toBe(302)
      expect(response.headers.get("location")).toBe("/connexion?erreur=hgdc")
    }
  })

  it("Convex injoignable : page d'erreur du produit, sans lever", async () => {
    const entry = createHgdcEntry({
      proxy: () => Promise.reject(new Error("réseau")),
      errorCallbackURL: "/sign-in?error=1",
    })
    const response = await entry(visit("/auth/hgdc", { cookie: "s=1" }))
    expect(response.headers.get("location")).toBe("/sign-in?error=1")
  })
})
