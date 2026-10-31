import { betterAuth } from "better-auth/minimal"
import { genericOAuth } from "better-auth/plugins/generic-oauth"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HGDC_ACCEPTED_ISSUERS, HGDC_ID_ISSUER, HGDC_ISSUER } from "./index.ts"
import { assertCallbackIssuer, hgdcProvider } from "./server.ts"

// Retour OAuth d'un produit avec le vrai `genericOAuth` de better-auth 1.6 (ADR 0015 de la famille) :
// le paramètre `iss` (RFC 9207) accepte les deux noms de l'émetteur, refuse tout autre et son absence,
// avant que le code ne soit présenté au point de jeton.

const BASE = "https://produit.exemple.ch/api/auth"
const TOKEN_URL = `${HGDC_ISSUER}/oauth2/token`

function product() {
  return betterAuth({
    baseURL: BASE,
    secret: "secret-de-test-assez-long-pour-better-auth",
    plugins: [genericOAuth({ config: [hgdcProvider({ clientId: "produit", clientSecret: "secret" })] })],
  })
}

/** Appels réseau du serveur : le point de jeton répond une erreur, seul l'appel compte ici. */
function network() {
  const urls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
      return Response.json({ error: "invalid_grant" }, { status: 400 })
    }),
  )
  return urls
}

async function signIn(auth: ReturnType<typeof product>) {
  const response = await auth.handler(
    new Request(`${BASE}/sign-in/oauth2`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://produit.exemple.ch" },
      body: JSON.stringify({ providerId: "hgdc", callbackURL: "/", errorCallbackURL: "/erreur" }),
    }),
  )
  const { url } = (await response.json()) as { url: string }
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ")
  return { url: new URL(url), cookie }
}

async function callback(iss: string | null) {
  const auth = product()
  const urls = network()
  const { url, cookie } = await signIn(auth)
  const query = new URLSearchParams({ code: "code-de-test", state: url.searchParams.get("state") ?? "" })
  if (iss !== null) query.set("iss", iss)
  const response = await auth.handler(new Request(`${BASE}/oauth2/callback/hgdc?${query}`, { headers: { cookie } }))
  return { urls, location: response.headers.get("location") ?? "", authorize: url }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("retour OAuth de HGDC avec genericOAuth 1.6", () => {
  it("connexion sans découverte, vers le point d'autorisation de l'émetteur", async () => {
    const { authorize, urls } = await callback(HGDC_ISSUER)
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${HGDC_ISSUER}/oauth2/authorize`)
    expect(urls.some((url) => url.includes("/.well-known/"))).toBe(false)
  })

  it.each(HGDC_ACCEPTED_ISSUERS)("iss %s : le code part au point de jeton", async (iss) => {
    const { urls } = await callback(iss)
    expect(urls).toContain(TOKEN_URL)
  })

  it.each([
    ["un autre émetteur", "https://evil.exemple.ch/api/auth"],
    ["un nom voisin", `${HGDC_ID_ISSUER}/`],
    ["vide", ""],
    ["absent", null],
  ])("iss %s : refusé avant le point de jeton", async (_, iss) => {
    const { urls, location } = await callback(iss)
    expect(urls).not.toContain(TOKEN_URL)
    expect(location).toContain("error=")
  })
})

describe("assertCallbackIssuer", () => {
  it("accepte les deux noms de l'émetteur de production, rien d'autre", () => {
    expect(() => assertCallbackIssuer(HGDC_ISSUER, HGDC_ISSUER)).not.toThrow()
    expect(() => assertCallbackIssuer(HGDC_ID_ISSUER, HGDC_ISSUER)).not.toThrow()
    expect(() => assertCallbackIssuer("https://evil.exemple.ch/api/auth", HGDC_ISSUER)).toThrow(/autre émetteur/)
    expect(() => assertCallbackIssuer(undefined, HGDC_ISSUER)).toThrow(/absent/)
    expect(() => assertCallbackIssuer(["x"], HGDC_ISSUER)).toThrow(/absent/)
  })

  it("un Account local n'accepte que lui-même", () => {
    const local = "http://localhost:3200/api/auth"
    expect(() => assertCallbackIssuer(local, local)).not.toThrow()
    expect(() => assertCallbackIssuer(HGDC_ISSUER, local)).toThrow(/autre émetteur/)
  })
})
