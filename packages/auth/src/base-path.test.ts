import { describe, expect, it } from "vitest"

import { hgdcEntryUrl, hgdcRefreshPath, normalizeBasePath, safeNextPath, withBasePath } from "./index.ts"
import { createAuthProxy, createHgdcEntry } from "./server.ts"

const BASE = "/analytics"
const AUTHORIZE = "https://account.hgdc.ch/api/auth/oauth2/authorize?client_id=x"

describe("normalizeBasePath", () => {
  it("rend une base propre, ou vide pour la racine", () => {
    for (const root of [undefined, null, "", "/"]) expect(normalizeBasePath(root)).toBe("")
    expect(normalizeBasePath("/analytics")).toBe("/analytics")
    expect(normalizeBasePath("/analytics/")).toBe("/analytics")
    expect(normalizeBasePath("/a/b-c_d.e~f")).toBe("/a/b-c_d.e~f")
  })

  it("lève sur tout ce qui n'est pas un chemin de segments simples", () => {
    for (const bad of [
      "analytics",
      "//evil.ch",
      "//",
      "/a//b",
      "/analytics//",
      "/a?x=1",
      "/a#b",
      "/a b",
      "/a\\b",
      "/%2e%2e",
      "/a%2Fb",
      "/..",
      "/a/../b",
      "/.",
      "https://evil.ch",
      "/é",
      "/a\r\nx",
    ])
      expect(() => normalizeBasePath(bad), bad).toThrow(/basePath invalide/)
  })

  it("withBasePath préfixe", () => {
    expect(withBasePath(BASE, "/o/acme")).toBe("/analytics/o/acme")
    expect(withBasePath(undefined, "/o/acme")).toBe("/o/acme")
  })
})

describe("safeNextPath avec une base", () => {
  const safe = (value: string) => safeNextPath(value, "/", { basePath: BASE })

  it("sans base, comportement inchangé", () => {
    expect(safeNextPath("/analytics/auth/hgdc")).toBe("/analytics/auth/hgdc")
    expect(safeNextPath("/analytics/api/auth/x", "/", {})).toBe("/analytics/api/auth/x")
  })

  it("garde un chemin du produit", () => {
    expect(safe("/o/acme?x=1#h")).toBe("/o/acme?x=1#h")
  })

  it("refuse l'entrée et better-auth, avec et sans la base", () => {
    for (const value of [
      "/auth/hgdc",
      "/analytics/auth/hgdc",
      "/analytics/auth/hgdc/",
      "/analytics/auth/hgdc?next=/x",
      "/analytics/api/auth",
      "/analytics/api/auth/sign-out",
      "/api/auth/sign-out",
      "/analytics/x/../auth/hgdc",
      "/analytics/%2e%2e/analytics/auth/hgdc",
    ])
      expect(safe(value), value).toBe("/")
    expect(safe("/analytics/api/authentique")).toBe("/analytics/api/authentique")
  })

  it("refuse toujours les adresses externes", () => {
    for (const value of [
      "//evil.ch",
      "/\\evil.ch",
      "https://evil.ch",
      "//analytics/evil",
      "/analytics\\..\\evil",
      "/\tx",
    ])
      expect(safe(value), value).toBe("/")
  })

  it("lève sur une base invalide plutôt que de filtrer à moitié", () => {
    expect(() => safeNextPath("/x", "/", { basePath: "//evil.ch" })).toThrow(/basePath invalide/)
  })
})

describe("hgdcEntryUrl et hgdcRefreshPath avec une base", () => {
  it("construit l'adresse sous la base, `next` sans la base", () => {
    expect(hgdcEntryUrl("https://app.hgdc.ch", undefined, { basePath: BASE })).toBe(
      "https://app.hgdc.ch/analytics/auth/hgdc",
    )
    expect(hgdcEntryUrl("https://app.hgdc.ch", "/o/acme", { basePath: BASE, refresh: "background" })).toBe(
      "https://app.hgdc.ch/analytics/auth/hgdc?refresh=background&next=%2Fo%2Facme",
    )
  })

  it("sans base : inchangé", () => {
    expect(hgdcEntryUrl("https://mail.hgdc.ch", "/o/acme")).toBe("https://mail.hgdc.ch/auth/hgdc?next=%2Fo%2Facme")
    expect(hgdcRefreshPath("/o/acme")).toBe("/auth/hgdc?refresh=1&next=%2Fo%2Facme")
  })

  it("refuse un `next` qui bouclerait sur l'entrée de la base", () => {
    expect(hgdcEntryUrl("https://app.hgdc.ch", "/analytics/auth/hgdc", { basePath: BASE })).toBe(
      "https://app.hgdc.ch/analytics/auth/hgdc",
    )
  })

  it("hgdcRefreshPath rend un chemin sous la base", () => {
    expect(hgdcRefreshPath("/o/acme?synced=1&a=b", { basePath: BASE })).toBe(
      "/analytics/auth/hgdc?refresh=1&next=%2Fo%2Facme%3Fa%3Db",
    )
    expect(hgdcRefreshPath("/analytics/auth/hgdc", { basePath: BASE })).toBe("/analytics/auth/hgdc?refresh=1&next=%2F")
    expect(hgdcRefreshPath("//evil.ch", { basePath: BASE })).toBe("/analytics/auth/hgdc?refresh=1&next=%2F")
  })
})

describe("createAuthProxy avec une base", () => {
  function recorder() {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    return { calls, fetchImpl }
  }

  it("retire la base avant de relayer, requête gardée", async () => {
    const { calls, fetchImpl } = recorder()
    const proxy = createAuthProxy("https://exemple.convex.site", fetchImpl, { basePath: BASE })
    await proxy(new Request("https://app.hgdc.ch/analytics/api/auth/oauth2/callback/hgdc?code=1&state=2"))
    expect(calls).toEqual(["https://exemple.convex.site/api/auth/oauth2/callback/hgdc?code=1&state=2"])
  })

  it("ne retire la base qu'une fois et sur une frontière de segment", async () => {
    const { calls, fetchImpl } = recorder()
    const proxy = createAuthProxy("https://exemple.convex.site", fetchImpl, { basePath: BASE })
    // Base doublée : elle mènerait à l'instance de la vue seule, refusée sans appel.
    expect((await proxy(new Request("https://app.hgdc.ch/analytics/analytics/api/auth/x"))).status).toBe(404)
    await proxy(new Request("https://app.hgdc.ch/analyticsx/api/auth/x"))
    await proxy(new Request("https://app.hgdc.ch/analytics"))
    expect(calls).toEqual([
      "https://exemple.convex.site/analyticsx/api/auth/x",
      "https://exemple.convex.site/analytics",
    ])
  })

  it("vue seule (x-hgdc-view: seul) : vers l'instance montée sous la base", async () => {
    const { calls, fetchImpl } = recorder()
    const proxy = createAuthProxy("https://exemple.convex.site", fetchImpl, { basePath: BASE })
    const seul = { headers: { "x-hgdc-view": "seul" } }
    await proxy(new Request("https://analytics.hgdc.cloud/analytics/api/auth/oauth2/callback/hgdc?code=1", seul))
    await proxy(new Request("https://analytics.hgdc.cloud/api/auth/get-session", seul))
    // Toute autre valeur vaut la vue app.
    await proxy(
      new Request("https://analytics.hgdc.cloud/analytics/api/auth/x", { headers: { "x-hgdc-view": "SEUL" } }),
    )
    expect(calls).toEqual([
      "https://exemple.convex.site/analytics/api/auth/oauth2/callback/hgdc?code=1",
      "https://exemple.convex.site/analytics/api/auth/get-session",
      "https://exemple.convex.site/api/auth/x",
    ])
  })

  it("sans base, l'en-tête de vue ne change rien", async () => {
    const { calls, fetchImpl } = recorder()
    const seul = { headers: { "x-hgdc-view": "seul" } }
    await createAuthProxy(
      "https://exemple.convex.site",
      fetchImpl,
    )(new Request("https://status.hgdc.ch/api/auth/x", seul))
    expect(calls).toEqual(["https://exemple.convex.site/api/auth/x"])
  })

  it("laisse passer un chemin sans la base (appels internes de l'entrée)", async () => {
    const { calls, fetchImpl } = recorder()
    const proxy = createAuthProxy("https://exemple.convex.site", fetchImpl, { basePath: BASE })
    await proxy(new Request("https://app.hgdc.ch/api/auth/get-session"))
    expect(calls).toEqual(["https://exemple.convex.site/api/auth/get-session"])
  })

  it("une remontée `..` ne sort jamais de l'hôte Convex", async () => {
    const { calls, fetchImpl } = recorder()
    const proxy = createAuthProxy("https://exemple.convex.site", fetchImpl, { basePath: BASE })
    await proxy(new Request("https://app.hgdc.ch/analytics/../evil"))
    expect(calls[0]).toBe("https://exemple.convex.site/evil")
  })

  it("sans base : chemin transmis tel quel", async () => {
    const { calls, fetchImpl } = recorder()
    await createAuthProxy("https://exemple.convex.site", fetchImpl)(new Request("https://a.ch/analytics/api/auth/x"))
    expect(calls).toEqual(["https://exemple.convex.site/analytics/api/auth/x"])
  })

  it("refuse une base invalide dès la création", () => {
    expect(() => createAuthProxy("https://exemple.convex.site", fetch, { basePath: "//evil" })).toThrow(
      /basePath invalide/,
    )
  })
})

describe("createHgdcEntry avec appBasePath", () => {
  type Call = { url: string; body: string }

  function setup(options: { session?: boolean } = {}) {
    const calls: Call[] = []
    const proxy = async (request: Request) => {
      calls.push({ url: request.url, body: await request.text() })
      const path = new URL(request.url).pathname
      if (path === "/api/auth/get-session")
        return Response.json(options.session ? { session: { id: "s" }, user: { id: "u" } } : null)
      if (path === "/api/auth/sign-in/oauth2") return Response.json({ url: AUTHORIZE, redirect: true })
      return new Response("not found", { status: 404 })
    }
    return { calls, proxy }
  }

  function visit(path: string, cookie = false) {
    return new Request(`https://app.hgdc.ch${BASE}${path}`, { headers: cookie ? { cookie: "p.session_token=t" } : {} })
  }

  const callbacks = (calls: Call[]) =>
    JSON.parse(calls.at(-1)?.body ?? "{}") as { callbackURL: string; errorCallbackURL: string }

  it("remet `next` et la page d'erreur sous la base", async () => {
    const { calls, proxy } = setup()
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/connexion?erreur=refus", appBasePath: BASE })
    const response = await entry(visit("/auth/hgdc?next=%2Fo%2Facme"))
    expect(response.headers.get("location")).toBe(AUTHORIZE)
    expect(callbacks(calls)).toEqual({
      providerId: "hgdc",
      callbackURL: "/analytics/o/acme",
      errorCallbackURL: "/analytics/connexion?erreur=refus",
    })
  })

  it("sans `next` : la racine de la base", async () => {
    const { calls, proxy } = setup()
    await createHgdcEntry({ proxy, errorCallbackURL: "/connexion", appBasePath: BASE })(visit("/auth/hgdc"))
    expect(callbacks(calls).callbackURL).toBe("/analytics/")
  })

  it("vue seule : Origin des appels internes = origine de la vue seule", async () => {
    const origins: Array<string | null> = []
    const proxy = async (request: Request) => {
      origins.push(request.headers.get("origin"))
      return Response.json({ url: AUTHORIZE, redirect: true })
    }
    const entry = createHgdcEntry({
      proxy,
      errorCallbackURL: "/connexion",
      appBasePath: BASE,
      appOrigin: "https://app.hgdc.ch",
      soloOrigin: "https://analytics.hgdc.ch",
    })
    await entry(new Request("https://analytics.hgdc.cloud/analytics/auth/hgdc", { headers: { "x-hgdc-view": "seul" } }))
    await entry(new Request("https://analytics.hgdc.cloud/analytics/auth/hgdc"))
    expect(origins).toEqual(["https://analytics.hgdc.ch", "https://app.hgdc.ch"])
  })

  it("session ouverte : redirige sous la base", async () => {
    const { proxy } = setup({ session: true })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/connexion", appBasePath: BASE })
    const response = await entry(visit("/auth/hgdc?next=/dashboard", true))
    expect(response.headers.get("location")).toBe("/analytics/dashboard")
  })

  it("refresh=background : cookie de relecture limité à la base et portant la base", async () => {
    const { proxy } = setup({ session: true })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/connexion", appBasePath: BASE })
    const response = await entry(visit("/auth/hgdc?refresh=background&next=/", true))
    expect(response.headers.get("location")).toBe("/analytics/")
    // Sous une origine partagée, un autre produit ne le voit pas et ne le consomme pas.
    expect(response.headers.getSetCookie()).toEqual([
      "hgdc-org-sync=/analytics; Path=/analytics; Max-Age=60; SameSite=Lax; Secure",
    ])
  })

  it("refresh=1 : retour sous la base avec le marqueur ; cadre : réponse vide sous la base", async () => {
    const { calls, proxy } = setup()
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/connexion", appBasePath: BASE })
    await entry(visit("/auth/hgdc?refresh=1&next=/o/acme"))
    expect(callbacks(calls).callbackURL).toBe("/analytics/o/acme?synced=1")
    await entry(visit("/auth/hgdc?refresh=1&frame=1&next=/o/acme"))
    expect(callbacks(calls)).toMatchObject({
      callbackURL: "/analytics/auth/hgdc?frame=done",
      errorCallbackURL: "/analytics/auth/hgdc?frame=done",
    })
  })

  it("attaques : `next` externe, hors base ou en boucle ne sort pas de la base", async () => {
    for (const next of [
      "//evil.ch",
      "/\\evil.ch",
      "https://evil.ch",
      "/analytics/auth/hgdc",
      "/analytics/api/auth/sign-out",
      "/api/auth/sign-out",
      "/auth/hgdc",
    ]) {
      const { calls, proxy } = setup()
      const entry = createHgdcEntry({ proxy, errorCallbackURL: "/connexion", appBasePath: BASE })
      const response = await entry(visit(`/auth/hgdc?next=${encodeURIComponent(next)}`))
      expect(response.status, next).toBe(302)
      expect(callbacks(calls).callbackURL, next).toBe("/analytics/")
    }
  })

  it("session ouverte et `next` hostile : retour sur la racine de la base", async () => {
    const { proxy } = setup({ session: true })
    const entry = createHgdcEntry({ proxy, errorCallbackURL: "/connexion", appBasePath: BASE })
    const response = await entry(visit("/auth/hgdc?next=%2F%2Fevil.ch", true))
    expect(response.headers.get("location")).toBe("/analytics/")
  })

  it("une page d'erreur qui boucle ou sort est refusée à la création", () => {
    const { proxy } = setup()
    for (const errorCallbackURL of ["https://evil.ch", "/analytics/auth/hgdc", "//evil.ch"])
      expect(() => createHgdcEntry({ proxy, errorCallbackURL, appBasePath: BASE })).toThrow(/errorCallbackURL/)
  })

  it("base invalide : refusée à la création", () => {
    const { proxy } = setup()
    expect(() => createHgdcEntry({ proxy, errorCallbackURL: "/c", appBasePath: "//evil.ch" })).toThrow(/basePath/)
    expect(() => createHgdcEntry({ proxy, errorCallbackURL: "/c", appBasePath: "/a?b" })).toThrow(/basePath/)
  })

  it("sans appBasePath (ou `/`) : rien ne change", async () => {
    for (const appBasePath of [undefined, "", "/"]) {
      const { calls, proxy } = setup()
      const entry = createHgdcEntry({
        proxy,
        errorCallbackURL: "/connexion",
        ...(appBasePath === undefined ? {} : { appBasePath }),
      })
      await entry(new Request("https://mail.hgdc.ch/auth/hgdc?next=/o/acme"))
      expect(callbacks(calls)).toEqual({ providerId: "hgdc", callbackURL: "/o/acme", errorCallbackURL: "/connexion" })
    }
  })
})

describe("createHgdcEntry avec appOrigin", () => {
  it("envoie l'origine publique aux appels internes, pas l'hôte relayé", async () => {
    const origins: (string | null)[] = []
    const proxy = async (request: Request) => {
      origins.push(request.headers.get("origin"))
      const path = new URL(request.url).pathname
      if (path === "/api/auth/get-session") return Response.json(null)
      return Response.json({ url: AUTHORIZE, redirect: true })
    }
    const entry = createHgdcEntry({
      proxy,
      errorCallbackURL: "/connexion",
      appBasePath: BASE,
      appOrigin: "https://app.hgdc.ch",
    })
    const relayed = new Request(`https://analytics.hgdc.cloud${BASE}/auth/hgdc?next=/`, {
      headers: { cookie: "p.session_token=périmé", origin: "https://evil.example" },
    })
    expect((await entry(relayed)).headers.get("location")).toBe(AUTHORIZE)
    expect(origins).toEqual(["https://app.hgdc.ch", "https://app.hgdc.ch"])
  })

  it("sans appOrigin : l'origine de la requête, comme avant", async () => {
    const origins: (string | null)[] = []
    const proxy = async (request: Request) => {
      origins.push(request.headers.get("origin"))
      return Response.json({ url: AUTHORIZE, redirect: true })
    }
    await createHgdcEntry({ proxy, errorCallbackURL: "/connexion" })(new Request("https://mail.hgdc.ch/auth/hgdc"))
    expect(origins).toEqual(["https://mail.hgdc.ch"])
  })
})
