import { describe, expect, it } from "vitest"
import {
  canonicalResource,
  extractBearer,
  protectedResourceMetadata,
  protectedResourceMetadataResponse,
  protectedResourceMetadataUrl,
  safeEqual,
  safeEqualHash,
  unauthorized,
  wwwAuthenticate,
  asciiChallengeText,
} from "./bearer.ts"

describe("extractBearer", () => {
  it("lit le jeton, schéma insensible à la casse", () => {
    expect(extractBearer("Bearer abc.DEF-123_~+/=")).toBe("abc.DEF-123_~+/=")
    expect(extractBearer("bearer  tok")).toBe("tok")
    expect(extractBearer(new Headers({ authorization: "Bearer tok" }))).toBe("tok")
    expect(extractBearer(new Request("https://x.test", { headers: { authorization: "Bearer tok" } }))).toBe("tok")
  })

  it("refuse le reste", () => {
    for (const value of [
      null,
      undefined,
      "",
      "Bearer",
      "Bearer ",
      "Basic abc",
      "Bearer a b",
      "Bearer aé",
      `Bearer ${"a".repeat(5000)}`,
    ]) {
      expect(extractBearer(value)).toBeNull()
    }
  })
})

describe("comparaison en temps constant", () => {
  it("égalité exacte", async () => {
    expect(safeEqual("abc", "abc")).toBe(true)
    expect(safeEqual("abc", "abd")).toBe(false)
    expect(safeEqual("abc", "abcd")).toBe(false)
    expect(safeEqual("", "")).toBe(true)
    expect(safeEqual("é", "e")).toBe(false)
    expect(await safeEqualHash("abc", "abc")).toBe(true)
    expect(await safeEqualHash("abc", "abcd")).toBe(false)
  })

  it("parcourt toujours toute la longueur : le premier écart ne raccourcit pas la boucle", () => {
    // Témoin structurel : on compte les lectures d'octets par un proxy sur TextEncoder.
    const reads: number[] = []
    const descriptor = Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encode")!
    const encoder = new TextEncoder()
    const encode = descriptor.value as (this: TextEncoder, input?: string) => Uint8Array<ArrayBuffer>
    TextEncoder.prototype.encode = (input?: string) =>
      new Proxy(encode.call(encoder, input), {
        get(target, prop) {
          if (typeof prop === "string" && /^\d+$/.test(prop)) reads.push(Number(prop))
          return Reflect.get(target, prop) as unknown
        },
      })
    try {
      reads.length = 0
      safeEqual("x".repeat(64), `y${"x".repeat(63)}`)
      const early = reads.length
      reads.length = 0
      safeEqual("x".repeat(64), `${"x".repeat(63)}y`)
      expect(early).toBe(reads.length)
      expect(early).toBe(128)
    } finally {
      Object.defineProperty(TextEncoder.prototype, "encode", descriptor)
    }
  })
})

describe("défi et 401", () => {
  const metadata = "https://app.hgdc.ch/.well-known/oauth-protected-resource/mail/mcp"

  it("WWW-Authenticate avec resource_metadata et paramètres échappés", () => {
    expect(wwwAuthenticate()).toBe("Bearer")
    expect(wwwAuthenticate({ resourceMetadata: metadata, scope: "mail:read mail:write" })).toBe(
      `Bearer resource_metadata="${metadata}", scope="mail:read mail:write"`,
    )
    expect(wwwAuthenticate({ error: "invalid_token", errorDescription: 'a "b"\r\nc' })).toBe(
      'Bearer error="invalid_token", error_description="a b c"',
    )
  })

  it("en-tête en ASCII, message accentué dans le corps", async () => {
    expect(asciiChallengeText("Clé d’API inconnue ou révoquée — « hgdc_mail_… »")).toBe(
      "Cle d'API inconnue ou revoquee - hgdc_mail_...",
    )
    const response = unauthorized({
      error: "invalid_token",
      errorDescription: "Jeton d'accès refusé.",
      realm: "Médias",
      detail: "Jeton d'accès refusé.",
    })
    const header = response.headers.get("www-authenticate")!
    expect(header).toBe(`Bearer realm="Medias", error="invalid_token", error_description="Jeton d'acces refuse."`)
    expect(/^[ -~]*$/.test(header)).toBe(true)
    expect(((await response.json()) as { detail: string }).detail).toBe("Jeton d'accès refusé.")
  })

  it("401 sans jeton, en problem+json", async () => {
    const response = unauthorized({ resourceMetadata: metadata })
    expect(response.status).toBe(401)
    expect(response.headers.get("content-type")).toBe("application/problem+json")
    expect(response.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${metadata}"`)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.type).toBe("https://hgdc.ch/problems/authentication-required")
    expect(body.status).toBe(401)
  })

  it("401 jeton invalide, 403 droits insuffisants", () => {
    expect(unauthorized({ error: "invalid_token" }).status).toBe(401)
    const forbidden = unauthorized({ error: "insufficient_scope", scope: "mail:write", resourceMetadata: metadata })
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${metadata}", scope="mail:write", error="insufficient_scope"`,
    )
  })
})

describe("métadonnées de ressource protégée (RFC 9728)", () => {
  it("identifiant canonique", () => {
    expect(canonicalResource("HTTPS://App.HGDC.ch/mail/mcp/#x")).toBe("https://app.hgdc.ch/mail/mcp")
    expect(canonicalResource("https://api.mail.hgdc.ch/")).toBe("https://api.mail.hgdc.ch")
    expect(canonicalResource("http://localhost:3000/mcp")).toBe("http://localhost:3000/mcp")
    expect(() => canonicalResource("http://app.hgdc.ch/mcp")).toThrow(/sans HTTPS/)
  })

  it("adresse bien connue insérée entre l'hôte et le chemin", () => {
    expect(protectedResourceMetadataUrl("https://app.hgdc.ch/mail/mcp")).toBe(
      "https://app.hgdc.ch/.well-known/oauth-protected-resource/mail/mcp",
    )
    expect(protectedResourceMetadataUrl("https://api.mail.hgdc.ch")).toBe(
      "https://api.mail.hgdc.ch/.well-known/oauth-protected-resource",
    )
  })

  it("document et réponse", async () => {
    const doc = protectedResourceMetadata({
      resource: "https://app.hgdc.ch/mail/mcp/",
      authorizationServers: ["https://account.hgdc.ch"],
      scopesSupported: ["mail:read", "mail:write"],
      resourceName: "Mail",
    })
    expect(doc).toEqual({
      resource: "https://app.hgdc.ch/mail/mcp",
      authorization_servers: ["https://account.hgdc.ch"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mail:read", "mail:write"],
      resource_name: "Mail",
    })
    const response = protectedResourceMetadataResponse(doc)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(await response.json()).toEqual(doc)
  })
})
