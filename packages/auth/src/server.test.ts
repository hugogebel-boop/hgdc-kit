import { describe, expect, it } from "vitest"

import { HGDC_SCOPES } from "./index.ts"
import { createAuthProxy, hgdcProvider, restoreFetchMode } from "./server.ts"

describe("createAuthProxy", () => {
  function recorder() {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(null, { status: 401 })
    }) as typeof fetch
    return { calls, fetchImpl }
  }

  it("transmet chemin, requête et corps en mémoire vers Convex", async () => {
    const { calls, fetchImpl } = recorder()
    const proxy = createAuthProxy("https://exemple.convex.site", fetchImpl)
    const response = await proxy(
      new Request("https://account.hgdc.ch/api/auth/oauth2/token?x=1", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "2" },
        body: "{}",
      }),
    )
    expect(response.status).toBe(401)
    expect(calls[0]?.url).toBe("https://exemple.convex.site/api/auth/oauth2/token?x=1")
    expect(calls[0]?.init.body).toBeInstanceOf(ArrayBuffer)
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get("x-better-auth-forwarded-host")).toBe("account.hgdc.ch")
    expect(headers.get("content-length")).toBeNull()
    expect(calls[0]?.init.redirect).toBe("manual")
  })

  it("transporte le mode de la navigation, que Convex restaure", async () => {
    const { calls, fetchImpl } = recorder()
    await createAuthProxy(
      "https://exemple.convex.site",
      fetchImpl,
    )(new Request("https://a.ch/api/auth/oauth2/authorize", { headers: { "sec-fetch-mode": "navigate" } }))
    const forwarded = new Request("https://exemple.convex.site/x", {
      headers: { ...Object.fromEntries(new Headers(calls[0]?.init.headers)), "sec-fetch-mode": "cors" },
    })
    expect(restoreFetchMode(forwarded).headers.get("sec-fetch-mode")).toBe("navigate")
  })

  it("ignore un mode inconnu et ne touche pas une requête sans en-tête", () => {
    const odd = new Request("https://x.ch", { headers: { "x-hgdc-fetch-mode": "pirate", "sec-fetch-mode": "cors" } })
    expect(restoreFetchMode(odd).headers.get("sec-fetch-mode")).toBe("cors")
    const plain = new Request("https://x.ch")
    expect(restoreFetchMode(plain)).toBe(plain)
  })

  it("n'envoie pas de corps pour un GET", async () => {
    const { calls, fetchImpl } = recorder()
    await createAuthProxy("https://exemple.convex.site", fetchImpl)(new Request("https://a.ch/api/auth/ok"))
    expect(calls[0]?.init.body).toBeUndefined()
  })
})

describe("hgdcProvider", () => {
  it("configure la découverte, PKCE et la vérification de l'émetteur", () => {
    const config = hgdcProvider({ clientId: "id", clientSecret: "secret" })
    expect(config).toMatchObject({
      providerId: "hgdc",
      issuer: "https://account.hgdc.ch/api/auth",
      discoveryUrl: "https://account.hgdc.ch/api/auth/.well-known/openid-configuration",
      requireIssuerValidation: true,
      pkce: true,
      scopes: [...HGDC_SCOPES],
    })
  })

  it("accepte un émetteur de préproduction avec ou sans barre finale", () => {
    const config = hgdcProvider({ clientId: "id", clientSecret: "s", issuer: "http://localhost:3200/api/auth/" })
    expect(config.discoveryUrl).toBe("http://localhost:3200/api/auth/.well-known/openid-configuration")
  })

  it("refuse une configuration sans secret", () => {
    expect(() => hgdcProvider({ clientId: "id", clientSecret: "" })).toThrow(/clientSecret/)
  })

  it("valide le profil avant de créer un compte", async () => {
    const map = hgdcProvider({ clientId: "id", clientSecret: "s" }).mapProfileToUser
    if (!map) throw new Error("mapProfileToUser manquant")
    const user = await map({ sub: "u1", email: "ada@exemple.ch", email_verified: true, name: "Ada" })
    expect(user).toEqual({ email: "ada@exemple.ch", emailVerified: true, name: "Ada", image: null })
    expect(() => map({ sub: "u1", email: "pas-une-adresse", email_verified: true, name: "Ada" })).toThrow(
      /Profil HGDC invalide/,
    )
  })
})
