import { describe, expect, it } from "vitest"

import { soloOrigin } from "../../ui/src/addresses.ts"
import { viewAuthSites } from "./index.ts"

describe("viewAuthSites (ADR 0014)", () => {
  it("sous app.hgdc.ch : instance app sous la base, instance seule sur <mot>.hgdc.ch", () => {
    const sites = viewAuthSites("mail", { siteUrl: "https://app.hgdc.ch", basePath: "/mail" })
    expect(sites.app).toEqual({ baseURL: "https://app.hgdc.ch/mail/api/auth", trustedOrigins: ["https://app.hgdc.ch"] })
    expect(sites.solo).toEqual({
      baseURL: "https://mail.hgdc.ch",
      basePath: "/mail/api/auth",
      trustedOrigins: ["https://mail.hgdc.ch"],
    })
    expect(sites.soloEnabled).toBe(true)
  })

  it("même origine que soloOrigin de @hgdc/ui", () => {
    for (const product of ["analytics", "mail", "host", "portal", "iassistant"])
      expect(viewAuthSites(product, { siteUrl: "https://app.hgdc.ch", basePath: `/${product}` }).solo.baseURL).toBe(
        soloOrigin(product),
      )
  })

  it("à la racine (développement) : instance seule fermée, chemin posé quand même", () => {
    const sites = viewAuthSites("mail", { siteUrl: "http://localhost:3000" })
    expect(sites.app).toEqual({ baseURL: "http://localhost:3000", trustedOrigins: ["http://localhost:3000"] })
    expect(sites.solo).toEqual({ baseURL: "", basePath: "/mail/api/auth", trustedOrigins: [] })
    expect(sites.soloEnabled).toBe(false)
  })

  it("base d'un autre produit : instance seule fermée ; sans SITE_URL : aucune origine", () => {
    expect(viewAuthSites("mail", { siteUrl: "https://app.hgdc.ch", basePath: "/host" }).soloEnabled).toBe(false)
    expect(viewAuthSites("mail", { basePath: "/mail" }).app).toEqual({ baseURL: "", trustedOrigins: [] })
  })

  it("refuse un produit invalide et une base invalide", () => {
    expect(() => viewAuthSites("mail.evil", {})).toThrow(/produit invalide/)
    expect(() => viewAuthSites("mail", { basePath: "/a/../b" })).toThrow(/basePath invalide/)
  })
})
