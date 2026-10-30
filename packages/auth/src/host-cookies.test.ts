import { getCookies } from "better-auth/cookies"
import { describe, expect, it } from "vitest"

import { hgdcCookieOptions, hostCookiePrefix } from "./index.ts"

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
})
