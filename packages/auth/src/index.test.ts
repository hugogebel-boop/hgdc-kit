import { describe, expect, it } from "vitest"

import { hasRole, highestRole, parseHgdcProfile } from "./index.ts"

describe("highestRole", () => {
  it("garde le rôle le plus fort d'une liste better-auth", () => {
    expect(highestRole("member,admin")).toBe("admin")
    expect(highestRole(" owner , member")).toBe("owner")
  })

  it("ignore les rôles inconnus", () => {
    expect(highestRole("superadmin")).toBeNull()
    expect(highestRole("")).toBeNull()
    expect(highestRole("superadmin,member")).toBe("member")
  })
})

describe("hasRole", () => {
  it("compare au minimum demandé", () => {
    expect(hasRole("owner", "admin")).toBe(true)
    expect(hasRole("admin", "admin")).toBe(true)
    expect(hasRole("member", "admin")).toBe(false)
    expect(hasRole("inconnu", "member")).toBe(false)
  })
})

describe("parseHgdcProfile", () => {
  const profile = {
    sub: "u1",
    email: "ada@exemple.ch",
    email_verified: true,
    name: "Ada",
    organizations: [{ id: "o1", slug: "acme", name: "Acme SA", role: "admin" }],
    iss: "https://account.hgdc.ch/api/auth",
  }

  it("accepte un profil complet et ignore les claims standard en plus", () => {
    expect(parseHgdcProfile(profile)).toMatchObject({ sub: "u1", organizations: [{ role: "admin" }] })
  })

  it("refuse un profil sans adresse vérifiée ou avec un rôle inconnu", () => {
    expect(() => parseHgdcProfile({ ...profile, email_verified: undefined })).toThrow(/Profil HGDC invalide/)
    expect(() =>
      parseHgdcProfile({ ...profile, organizations: [{ id: "o1", slug: "acme", name: "Acme", role: "root" }] }),
    ).toThrow(/Profil HGDC invalide/)
  })
})
