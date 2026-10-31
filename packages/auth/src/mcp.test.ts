import { beforeAll, describe, expect, it, vi } from "vitest"

import { HGDC_ISSUER } from "./index.ts"
import {
  createHgdcJwks,
  HGDC_JWKS_URL,
  MCP_PRODUCTS,
  MCP_RESOURCES,
  MCP_SCOPES,
  McpTokenError,
  mcpProtectedResourceMetadata,
  mcpResource,
  mcpScopes,
  mcpTokenChallenge,
  parseMcpScope,
  verifyMcpAccessToken,
  type McpTokenRejection,
  type VerifyMcpAccessTokenOptions,
} from "./mcp.ts"

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0)
const iat = NOW / 1000
const KID = "cle-1"

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes).toString("base64url")

let privateKey: CryptoKey
let publicJwk: JsonWebKey
let otherPrivateKey: CryptoKey

async function rsaPair() {
  return await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )
}

beforeAll(async () => {
  const pair = await rsaPair()
  privateKey = pair.privateKey
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: KID, alg: "RS256" } as JsonWebKey
  otherPrivateKey = (await rsaPair()).privateKey
})

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = {}, key = privateKey) {
  const head = b64url(JSON.stringify({ alg: "RS256", kid: KID, ...header }))
  const body = b64url(JSON.stringify(payload))
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)),
  )
  return `${head}.${body}.${b64url(signature)}`
}

const claims = (overrides: Record<string, unknown> = {}) => ({
  iss: HGDC_ISSUER,
  aud: "https://app.hgdc.ch/portal/mcp",
  azp: "client-mcp",
  sub: "ada",
  scope: "portal:read portal:write offline_access",
  org_id: "org-acme",
  sid: "session-1",
  iat,
  exp: iat + 900,
  ...overrides,
})

const options = (overrides: Partial<VerifyMcpAccessTokenOptions> = {}): VerifyMcpAccessTokenOptions => ({
  product: "portal",
  keys: { keys: [publicJwk] },
  now: NOW,
  ...overrides,
})

async function rejection(token: string, opts = options()): Promise<McpTokenRejection | "OK"> {
  try {
    await verifyMcpAccessToken(token, opts)
    return "OK"
  } catch (error) {
    if (error instanceof McpTokenError) return error.reason
    throw error
  }
}

describe("produits, adresses et scopes", () => {
  it("une adresse canonique par produit, Account sur son domaine", () => {
    expect(mcpResource("portal")).toBe("https://app.hgdc.ch/portal/mcp")
    expect(mcpResource("account")).toBe("https://account.hgdc.ch/mcp")
    expect(MCP_RESOURCES).toHaveLength(MCP_PRODUCTS.length)
    for (const resource of MCP_RESOURCES) expect(resource).not.toMatch(/\/$/)
  })

  it("deux scopes par produit, pas d'admin", () => {
    expect(mcpScopes("mail")).toEqual(["mail:read", "mail:write"])
    expect(MCP_SCOPES).toHaveLength(MCP_PRODUCTS.length * 2)
    expect(parseMcpScope("mail:write")).toEqual({ product: "mail", right: "write" })
    for (const bad of ["mail:admin", "mail", "inconnu:read", "mail:read:x", "openid", ":read", "Mail:read"])
      expect(parseMcpScope(bad), bad).toBeNull()
  })

  it("refuse un produit inconnu", () => {
    expect(() => mcpResource("evil" as never)).toThrow("produit MCP inconnu")
    expect(() => mcpScopes("evil" as never)).toThrow("produit MCP inconnu")
  })

  it("document RFC 9728 : Account comme serveur d'autorisation, scopes du produit seulement", () => {
    expect(mcpProtectedResourceMetadata("mail", { resourceName: "Mail" })).toEqual({
      resource: "https://app.hgdc.ch/mail/mcp",
      authorization_servers: [HGDC_ISSUER],
      scopes_supported: ["mail:read", "mail:write", "offline_access"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256"],
      resource_name: "Mail",
    })
  })
})

describe("verifyMcpAccessToken", () => {
  it("accepte un jeton d'Account pour ce produit et ne rend que ses scopes", async () => {
    const token = await sign(claims({ scope: "portal:read portal:write mail:write offline_access" }))
    expect(await verifyMcpAccessToken(token, options())).toEqual({
      product: "portal",
      userId: "ada",
      clientId: "client-mcp",
      organizationId: "org-acme",
      scopes: ["portal:read", "portal:write"],
      canWrite: true,
      expiresAt: (iat + 900) * 1000,
    })
  })

  it("accepte une audience en tableau d'un seul élément", async () => {
    expect(await rejection(await sign(claims({ aud: ["https://app.hgdc.ch/portal/mcp"] })))).toBe("OK")
  })

  it("refuse un jeton émis pour un autre produit (confused deputy)", async () => {
    // Audience de Mail, même avec un scope Portal glissé dedans.
    const mail = await sign(claims({ aud: "https://app.hgdc.ch/mail/mcp", scope: "mail:write portal:write" }))
    expect(await rejection(mail)).toBe("wrong_audience")
    // Audience changée vers Portal (GHSA-p2fr-6hmx-4528) sans scope Portal accordé : rien.
    const swapped = await sign(claims({ scope: "mail:read mail:write offline_access" }))
    expect(await rejection(swapped)).toBe("insufficient_scope")
  })

  it("refuse une audience multiple, un id_token et un JWT Convex signés par la même clé", async () => {
    const multi = await sign(claims({ aud: ["https://app.hgdc.ch/portal/mcp", "https://app.hgdc.ch/mail/mcp"] }))
    expect(await rejection(multi)).toBe("wrong_audience")
    expect(await rejection(await sign(claims({ aud: "client-mcp" })))).toBe("wrong_audience")
    const convexJwt = await sign(claims({ iss: "https://actions.account.hgdc.ch", aud: "convex" }))
    expect(await rejection(convexJwt)).toBe("wrong_issuer")
  })

  it("refuse alg none, HS256 et une signature d'une autre clé", async () => {
    const valid = await sign(claims())
    const [, body] = valid.split(".")
    expect(await rejection(`${b64url(JSON.stringify({ alg: "none", kid: KID }))}.${body}.`)).toBe(
      "unsupported_algorithm",
    )
    expect(await rejection(`${b64url(JSON.stringify({ alg: "none", kid: KID }))}.${body}.AAAA`)).toBe(
      "unsupported_algorithm",
    )
    expect(await rejection(await sign(claims(), { alg: "HS256" }))).toBe("unsupported_algorithm")
    expect(await rejection(await sign(claims(), {}, otherPrivateKey))).toBe("bad_signature")
    expect(await rejection(await sign(claims(), { crit: ["exp"] }))).toBe("unsupported_algorithm")
  })

  it("refuse un payload modifié après signature", async () => {
    const [head, , signature] = (await sign(claims({ scope: "portal:read" }))).split(".")
    const forged = b64url(JSON.stringify(claims({ scope: "portal:write" })))
    expect(await rejection(`${head}.${forged}.${signature}`)).toBe("bad_signature")
  })

  it("refuse une clé inconnue, d'un autre type ou trop courte", async () => {
    expect(await rejection(await sign(claims(), { kid: "autre" }))).toBe("unknown_key")
    expect(await rejection(await sign(claims(), { kid: undefined }))).toBe("unknown_key")
    const ec = { kty: "EC", kid: KID, crv: "P-256", x: "AA", y: "AA" } as JsonWebKey
    expect(await rejection(await sign(claims()), options({ keys: { keys: [ec] } }))).toBe("unknown_key")
    const encryption = { ...publicJwk, use: "enc" } as JsonWebKey
    expect(await rejection(await sign(claims()), options({ keys: { keys: [encryption] } }))).toBe("unknown_key")
    const short = { ...publicJwk, n: b64url(new Uint8Array(128).fill(1)) } as JsonWebKey
    expect(await rejection(await sign(claims()), options({ keys: { keys: [short] } }))).toBe("unknown_key")
  })

  it("contrôle l'émetteur et les dates", async () => {
    expect(await rejection(await sign(claims({ iss: "https://evil.ch/api/auth" })))).toBe("wrong_issuer")
    // Deux noms du même émetteur (ADR 0015) ; une barre finale reste refusée.
    expect(await rejection(await sign(claims({ iss: "https://id.hgdc.ch/api/auth" })))).toBe("OK")
    expect(await rejection(await sign(claims({ iss: "https://id.hgdc.ch/api/auth/" })))).toBe("wrong_issuer")
    expect(await rejection(await sign(claims({ iat: iat - 2000, exp: iat - 100 })))).toBe("expired")
    expect(await rejection(await sign(claims({ iat: iat + 600, exp: iat + 1200 })))).toBe("not_yet_valid")
    expect(await rejection(await sign(claims({ nbf: iat + 600 })))).toBe("not_yet_valid")
    expect(await rejection(await sign(claims({ exp: iat + 86_400 })))).toBe("invalid_claims")
    expect(await rejection(await sign(claims({ exp: undefined })))).toBe("invalid_claims")
  })

  it("exige la personne, le client et l'organisation", async () => {
    expect(await rejection(await sign(claims({ sub: "" })))).toBe("invalid_claims")
    expect(await rejection(await sign(claims({ azp: undefined })))).toBe("invalid_claims")
    expect(await rejection(await sign(claims({ client_id: "autre" })))).toBe("invalid_claims")
    expect(await rejection(await sign(claims({ org_id: undefined })))).toBe("invalid_claims")
    expect(await rejection(await sign(claims({ org_id: 42 })))).toBe("invalid_claims")
    const account = await sign(claims({ aud: mcpResource("account"), scope: "account:read", org_id: undefined }))
    expect(await rejection(account, options({ product: "account", requireOrganization: false }))).toBe("OK")
  })

  it("lecture seule : 403 pour une écriture", async () => {
    const reader = await sign(claims({ scope: "portal:read" }))
    expect(await rejection(reader)).toBe("OK")
    expect(await rejection(reader, options({ require: "write" }))).toBe("insufficient_scope")
    const error = await verifyMcpAccessToken(reader, options({ require: "write" })).catch((e: unknown) => e)
    expect((error as McpTokenError).bearerError).toBe("insufficient_scope")
    expect(await rejection(await sign(claims({ scope: "openid offline_access" })))).toBe("insufficient_scope")
    expect(await rejection(await sign(claims({ scope: undefined })))).toBe("insufficient_scope")
  })

  it("défi : 403 avec le scope qui manque, 401 pour un jeton invalide", async () => {
    const refusal = async (token: string, extra: Partial<VerifyMcpAccessTokenOptions> = {}) => {
      const error = await verifyMcpAccessToken(token, options(extra)).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(McpTokenError)
      return mcpTokenChallenge(error as McpTokenError)
    }
    const noProductScope = await sign(claims({ scope: "openid status:read" }))
    expect(await refusal(noProductScope)).toEqual({ error: "insufficient_scope", scope: "portal:read" })
    expect(await refusal(await sign(claims({ scope: undefined })))).toEqual({
      error: "insufficient_scope",
      scope: "portal:read",
    })
    const reader = await sign(claims({ scope: "portal:read" }))
    expect(await refusal(reader, { require: "write" })).toEqual({ error: "insufficient_scope", scope: "portal:write" })
    expect(await refusal(await sign(claims({ iss: "https://evil.ch" })))).toEqual({ error: "invalid_token" })
    expect(mcpTokenChallenge(new McpTokenError("insufficient_scope", "x"))).toEqual({ error: "insufficient_scope" })
  })

  it("refuse un jeton illisible ou trop long", async () => {
    for (const token of ["", "a.b", "a.b.c.d", "!!.@@.##", "x".repeat(9000)])
      expect(await rejection(token), token.slice(0, 10)).toBe("malformed")
  })
})

describe("createHgdcJwks", () => {
  it("lit les clés une fois, relit pour un kid inconnu au plus une fois par minute", async () => {
    let clock = NOW
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({ keys: [publicJwk] }),
    )
    const lookup = createHgdcJwks({ fetch: fetchMock as unknown as typeof fetch, now: () => clock })
    expect(await lookup(KID)).toEqual(publicJwk)
    expect(await lookup(KID)).toEqual(publicJwk)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(HGDC_JWKS_URL, expect.anything())

    expect(await lookup("inconnu")).toBeNull()
    expect(await lookup("inconnu")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    clock += 61_000
    expect(await lookup("inconnu")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("garde les clés déjà lues si Account ne répond pas", async () => {
    let clock = NOW
    let up = true
    const lookup = createHgdcJwks({
      fetch: (async () => {
        if (!up) throw new Error("réseau")
        return Response.json({ keys: [publicJwk] })
      }) as unknown as typeof fetch,
      now: () => clock,
    })
    expect(await lookup(KID)).toEqual(publicJwk)
    up = false
    clock += 11 * 60_000
    expect(await lookup(KID)).toEqual(publicJwk)
  })

  it("sert de source à verifyMcpAccessToken", async () => {
    const lookup = createHgdcJwks({
      fetch: (async () => Response.json({ keys: [publicJwk] })) as unknown as typeof fetch,
    })
    expect(await rejection(await sign(claims()), options({ keys: lookup }))).toBe("OK")
  })
})
