import { getCookies } from "better-auth/cookies"
import { describe, expect, it } from "vitest"

import { assertHostCookies, hgdcCookieOptions, hostCookiePrefix } from "./index.ts"
import { withoutShadowCookies } from "./server.ts"

describe("cookies __Host- (ADR 0014)", () => {
  it("better-auth pose des cookies __Host- valides : Secure, Path=/, sans Domain", () => {
    const cookies = getCookies({ baseURL: "https://mail.hgdc.ch", advanced: hgdcCookieOptions("hgdc-mail") })
    expect(cookies.sessionToken.name).toBe("__Host-hgdc-mail.session_token")
    expect(cookies.sessionToken.attributes).toMatchObject({ secure: true, path: "/", httpOnly: true, sameSite: "lax" })
    expect(cookies.sessionToken.attributes).not.toHaveProperty("domain")
    for (const cookie of Object.values(cookies)) expect(cookie.name.startsWith("__Host-hgdc-mail.")).toBe(true)
  })

  it("refuse un préfixe hors de la famille", () => {
    for (const bad of ["mail", "hgdc-", "hgdc-Mail", "__Host-hgdc-mail", "hgdc-mail; Domain=hgdc.ch"])
      expect(() => hostCookiePrefix(bad)).toThrow(/préfixe invalide/)
  })

  it("assertHostCookies : accepte les réglages du kit, refuse ce qui les défait", () => {
    const base = { baseURL: "https://mail.hgdc.ch" }
    expect(() => assertHostCookies(getCookies({ ...base, advanced: hgdcCookieOptions("hgdc-mail") }))).not.toThrow()
    const spread = { ...hgdcCookieOptions("hgdc-mail"), defaultCookieAttributes: { path: "/" } }
    expect(() => assertHostCookies(getCookies({ ...base, advanced: spread }))).toThrow(/cookie d'hôte/)
    const cross = { ...hgdcCookieOptions("hgdc-mail"), crossSubDomainCookies: { enabled: true, domain: "hgdc.ch" } }
    expect(() => assertHostCookies(getCookies({ ...base, advanced: cross }))).toThrow(/cookie d'hôte/)
    expect(() => assertHostCookies(getCookies(base))).toThrow(/cookie d'hôte/)
  })

  it("withoutShadowCookies : retire les __Secure-__Host-, garde le reste", () => {
    const request = new Request("https://mail.hgdc.ch/", {
      headers: {
        cookie:
          "__Secure-__Host-hgdc-mail.convex_jwt=evil; __Host-hgdc-mail.session_token=ok; __secure-__host-hgdc-mail.x=evil; a=1",
      },
    })
    expect(withoutShadowCookies(request).headers.get("cookie")).toBe("__Host-hgdc-mail.session_token=ok; a=1")
    const only = new Request("https://mail.hgdc.ch/", {
      headers: { cookie: "__Secure-__Host-hgdc-mail.convex_jwt=evil" },
    })
    expect(withoutShadowCookies(only).headers.has("cookie")).toBe(false)
    const clean = new Request("https://mail.hgdc.ch/", { headers: { cookie: "a=1" } })
    expect(withoutShadowCookies(clean)).toBe(clean)
  })
})
