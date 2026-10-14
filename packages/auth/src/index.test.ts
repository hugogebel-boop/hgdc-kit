import { describe, expect, it } from "vitest"

import { hasRole, highestRole, organizationsFromIdToken, parseHgdcProfile, planOrganizationSync } from "./index.ts"

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
    expect(() => parseHgdcProfile({ ...profile, email_verified: false })).toThrow(/Profil HGDC invalide/)
    expect(() =>
      parseHgdcProfile({ ...profile, organizations: [{ id: "o1", slug: "acme", name: "Acme", role: "root" }] }),
    ).toThrow(/Profil HGDC invalide/)
  })
})

describe("organizationsFromIdToken", () => {
  const token = (payload: unknown) =>
    ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".")

  it("lit le claim organizations, accents compris", () => {
    const orgs = [{ id: "o1", slug: "cafe", name: "Café Zürich SA", role: "owner" }]
    expect(organizationsFromIdToken(token({ sub: "u1", organizations: orgs }))).toEqual(orgs)
  })

  it("rend une liste vide sans la portée", () => {
    expect(organizationsFromIdToken(token({ sub: "u1" }))).toEqual([])
  })

  it("refuse un jeton illisible ou un rôle inconnu", () => {
    expect(() => organizationsFromIdToken("pas-un-jeton")).toThrow(/illisible/)
    expect(() =>
      organizationsFromIdToken(token({ organizations: [{ id: "o1", slug: "a", name: "A", role: "superadmin" }] })),
    ).toThrow(/invalides/)
  })
})

describe("planOrganizationSync", () => {
  const acme = { id: "o1", slug: "acme", name: "Acme SA", role: "admin" } as const
  const copy = { organizationId: "o1", slug: "acme", name: "Acme SA", role: "admin" } as const

  it("n'écrit rien quand rien ne change", () => {
    expect(planOrganizationSync([acme], [copy])).toEqual({ upsert: [], remove: [] })
  })

  it("crée une organisation nouvelle et met à jour un rôle ou un nom changé", () => {
    const beta = { id: "o2", slug: "beta", name: "Beta", role: "member" } as const
    expect(planOrganizationSync([{ ...acme, role: "owner" }, beta], [copy]).upsert).toEqual([
      { ...acme, role: "owner" },
      beta,
    ])
    expect(planOrganizationSync([{ ...acme, name: "Acme Sàrl" }], [copy]).upsert).toHaveLength(1)
  })

  it("retire une organisation quittée", () => {
    expect(planOrganizationSync([], [copy])).toEqual({ upsert: [], remove: ["o1"] })
  })
})
