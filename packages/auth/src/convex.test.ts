import type { Auth, UserIdentity } from "convex/server"
import { describe, expect, it } from "vitest"

import { isAuthError, requireIdentity, requireOrgMember, type Membership } from "./convex.ts"

type Ctx = { auth: Auth; memberships: Membership[] }

function ctxFor(userId: string | null, memberships: Membership[]): Ctx {
  const identity: UserIdentity | null = userId
    ? {
        subject: userId,
        issuer: "https://exemple.convex.site",
        tokenIdentifier: `https://exemple.convex.site|${userId}`,
      }
    : null
  return { auth: { getUserIdentity: async () => identity }, memberships }
}

const load = async (ctx: Ctx, args: { organizationId: string; userId: string }) =>
  ctx.memberships.find((m) => m.organizationId === args.organizationId && m.userId === args.userId) ?? null

const acme: Membership[] = [
  { organizationId: "acme", userId: "ada", role: "owner" },
  { organizationId: "acme", userId: "bob", role: "member" },
]

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
    return "OK"
  } catch (error) {
    if (!isAuthError(error)) throw error
    return error.data.code
  }
}

describe("requireIdentity", () => {
  it("refuse une requête sans session", async () => {
    expect(await codeOf(requireIdentity(ctxFor(null, [])))).toBe("UNAUTHENTICATED")
  })
})

describe("requireOrgMember", () => {
  it("laisse passer un membre et renvoie son rôle", async () => {
    const access = await requireOrgMember(ctxFor("ada", acme), "acme", { load })
    expect(access).toMatchObject({ userId: "ada", role: "owner" })
  })

  it("refuse une personne qui n'appartient pas à l'organisation", async () => {
    expect(await codeOf(requireOrgMember(ctxFor("eve", acme), "acme", { load }))).toBe("FORBIDDEN")
  })

  it("refuse un membre d'une autre organisation", async () => {
    const other = [...acme, { organizationId: "globex", userId: "eve", role: "owner" }]
    expect(await codeOf(requireOrgMember(ctxFor("eve", other), "acme", { load }))).toBe("FORBIDDEN")
  })

  it("refuse un rôle insuffisant", async () => {
    expect(await codeOf(requireOrgMember(ctxFor("bob", acme), "acme", { load, minRole: "admin" }))).toBe("FORBIDDEN")
  })

  it("refuse sans session, avant toute lecture", async () => {
    let read = false
    const spy = async () => {
      read = true
      return null
    }
    expect(await codeOf(requireOrgMember(ctxFor(null, acme), "acme", { load: spy }))).toBe("UNAUTHENTICATED")
    expect(read).toBe(false)
  })

  it("refuse une appartenance renvoyée pour une autre personne", async () => {
    const wrong = async () => ({ organizationId: "acme", userId: "ada", role: "owner" })
    expect(await codeOf(requireOrgMember(ctxFor("eve", acme), "acme", { load: wrong }))).toBe("FORBIDDEN")
  })

  it("refuse un rôle inconnu", async () => {
    const odd = [{ organizationId: "acme", userId: "ada", role: "superadmin" }]
    expect(await codeOf(requireOrgMember(ctxFor("ada", odd), "acme", { load }))).toBe("FORBIDDEN")
  })
})
