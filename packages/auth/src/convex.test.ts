import type { Auth, UserIdentity } from "convex/server"
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import {
  appAccess,
  appAuthProviders,
  AUTH_ERROR_MESSAGES,
  hgdcAccountLookup,
  authErrorReason,
  convexAuthProviders,
  convexIssuers,
  currentAuthConfig,
  isAuthError,
  requireIdentity,
  requireOrgMember,
  requireUser,
  userIdOfAccount,
  type Membership,
} from "./convex.ts"

type Ctx = { auth: Auth; memberships: Membership[] }

const ISSUER = "https://exemple.convex.site"

function ctxFor(userId: string | null, memberships: Membership[], issuer = ISSUER): Ctx {
  const identity: UserIdentity | null = userId
    ? {
        subject: userId,
        issuer,
        tokenIdentifier: `${issuer}|${userId}`,
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

const PREVIOUS = "https://ancien.convex.site"

describe("requireIdentity", () => {
  it("refuse une requête sans session", async () => {
    expect(await codeOf(requireIdentity(ctxFor(null, []), { issuer: ISSUER }))).toBe("UNAUTHENTICATED")
  })

  it("accepte chacun des émetteurs d'une liste", async () => {
    const issuer = [ISSUER, `${PREVIOUS}/`]
    expect((await requireIdentity(ctxFor("ada", [], ISSUER), { issuer })).subject).toBe("ada")
    expect((await requireIdentity(ctxFor("ada", [], PREVIOUS), { issuer })).subject).toBe("ada")
  })

  it("refuse un émetteur hors de la liste", async () => {
    const forged = ctxFor("ada", [], "https://autre-fournisseur.example")
    await expect(requireIdentity(forged, { issuer: [ISSUER, PREVIOUS] })).rejects.toMatchObject({
      data: { reason: "wrong_issuer" },
    })
  })

  it("refuse de tourner avec une liste vide ou faite de chaînes vides", async () => {
    await expect(requireIdentity(ctxFor("ada", []), { issuer: [] })).rejects.toThrow(/émetteur/)
    await expect(requireIdentity(ctxFor("ada", []), { issuer: ["", "/"] })).rejects.toThrow(/émetteur/)
  })
})

describe("convexIssuers", () => {
  it("rend CONVEX_SITE_URL seule hors bascule", () => {
    expect(convexIssuers({ CONVEX_SITE_URL: `${ISSUER}/` })).toEqual([ISSUER])
  })

  it("ajoute CONVEX_PREVIOUS_SITE_URL pendant une bascule, sans doublon", () => {
    expect(convexIssuers({ CONVEX_SITE_URL: ISSUER, CONVEX_PREVIOUS_SITE_URL: ` ${PREVIOUS} ` })).toEqual([
      ISSUER,
      PREVIOUS,
    ])
    expect(convexIssuers({ CONVEX_SITE_URL: ISSUER, CONVEX_PREVIOUS_SITE_URL: `${ISSUER}/` })).toEqual([ISSUER])
  })

  it("rend une liste vide sans variable, que requireIdentity refuse", async () => {
    expect(convexIssuers({})).toEqual([])
    await expect(requireIdentity(ctxFor("ada", []), { issuer: convexIssuers({}) })).rejects.toThrow(/émetteur/)
  })
})

describe("convexAuthProviders", () => {
  const provider = { type: "customJwt", issuer: ISSUER, applicationID: "convex", jwks: "data:x" } as const

  it("rend le fournisseur seul hors bascule", () => {
    expect(convexAuthProviders(provider, {})).toEqual([provider])
  })

  it("ajoute une copie pour l'ancienne adresse, en second, même égale à la courante", () => {
    expect(convexAuthProviders(provider, { CONVEX_PREVIOUS_SITE_URL: `${PREVIOUS}/` })).toEqual([
      provider,
      { ...provider, issuer: PREVIOUS },
    ])
    expect(convexAuthProviders(provider, { CONVEX_PREVIOUS_SITE_URL: ISSUER })).toHaveLength(2)
  })

  it("ignore une variable dont la lecture lève, comme dans auth.config.ts de Convex", () => {
    const env = new Proxy<Record<string, string | undefined>>(
      {},
      {
        get() {
          throw new Error("variable absente")
        },
      },
    )
    expect(convexAuthProviders(provider, env)).toEqual([provider])
  })

  it("ne donne au plugin better-auth que le fournisseur courant", () => {
    const providers = convexAuthProviders(provider, { CONVEX_PREVIOUS_SITE_URL: PREVIOUS })
    expect(currentAuthConfig({ providers })).toEqual({ providers: [provider] })
  })
})

describe("requireOrgMember", () => {
  it("laisse passer un membre et renvoie son rôle", async () => {
    const access = await requireOrgMember(ctxFor("ada", acme), "acme", { load, issuer: ISSUER })
    expect(access).toMatchObject({ userId: "ada", role: "owner" })
  })

  it("refuse une personne qui n'appartient pas à l'organisation", async () => {
    expect(await codeOf(requireOrgMember(ctxFor("eve", acme), "acme", { load, issuer: ISSUER }))).toBe("FORBIDDEN")
  })

  it("refuse un membre d'une autre organisation", async () => {
    const other = [...acme, { organizationId: "globex", userId: "eve", role: "owner" }]
    expect(await codeOf(requireOrgMember(ctxFor("eve", other), "acme", { load, issuer: ISSUER }))).toBe("FORBIDDEN")
  })

  it("refuse un rôle insuffisant", async () => {
    expect(
      await codeOf(requireOrgMember(ctxFor("bob", acme), "acme", { load, minRole: "admin", issuer: ISSUER })),
    ).toBe("FORBIDDEN")
  })

  it("refuse sans session, avant toute lecture", async () => {
    let read = false
    const spy = async () => {
      read = true
      return null
    }
    expect(await codeOf(requireOrgMember(ctxFor(null, acme), "acme", { load: spy, issuer: ISSUER }))).toBe(
      "UNAUTHENTICATED",
    )
    expect(read).toBe(false)
  })

  it("refuse une appartenance renvoyée pour une autre personne", async () => {
    const wrong = async () => ({ organizationId: "acme", userId: "ada", role: "owner" })
    expect(await codeOf(requireOrgMember(ctxFor("eve", acme), "acme", { load: wrong, issuer: ISSUER }))).toBe(
      "FORBIDDEN",
    )
  })

  it("refuse une identité d'un autre émetteur qui présente le subject d'un membre", async () => {
    const forged = ctxFor("ada", acme, "https://autre-fournisseur.example")
    expect(await codeOf(requireOrgMember(forged, "acme", { load, issuer: ISSUER }))).toBe("UNAUTHENTICATED")
  })

  it("accepte l'émetteur attendu avec ou sans barre finale", async () => {
    const access = await requireOrgMember(ctxFor("ada", acme, `${ISSUER}/`), "acme", { load, issuer: ISSUER })
    expect(access.role).toBe("owner")
  })

  it("refuse de tourner sans émetteur attendu", async () => {
    await expect(requireOrgMember(ctxFor("ada", acme), "acme", { load, issuer: "" })).rejects.toThrow(/émetteur/)
  })

  it("refuse un rôle inconnu", async () => {
    const odd = [{ organizationId: "acme", userId: "ada", role: "superadmin" }]
    expect(await codeOf(requireOrgMember(ctxFor("ada", odd), "acme", { load, issuer: ISSUER }))).toBe("FORBIDDEN")
  })
})

async function reasonOf(promise: Promise<unknown>) {
  try {
    await promise
    return "OK"
  } catch (error) {
    return authErrorReason(error) ?? "OTHER"
  }
}

describe("raison des refus", () => {
  it("distingue chaque refus par reason, sans lire le message", async () => {
    expect(await reasonOf(requireIdentity(ctxFor(null, []), { issuer: ISSUER }))).toBe("no_session")
    const forged = ctxFor("ada", acme, "https://autre-fournisseur.example")
    expect(await reasonOf(requireIdentity(forged, { issuer: ISSUER }))).toBe("wrong_issuer")
    expect(await reasonOf(requireOrgMember(ctxFor("eve", acme), "acme", { load, issuer: ISSUER }))).toBe("not_member")
    expect(
      await reasonOf(requireOrgMember(ctxFor("bob", acme), "acme", { load, minRole: "admin", issuer: ISSUER })),
    ).toBe("insufficient_role")
  })

  it("porte code, reason et message au tutoiement, sans grand tiret", async () => {
    await expect(
      requireOrgMember(ctxFor("bob", acme), "acme", { load, minRole: "owner", issuer: ISSUER }),
    ).rejects.toMatchObject({
      data: {
        code: "FORBIDDEN",
        reason: "insufficient_role",
        message: "Ton rôle dans cette organisation ne permet pas cette action.",
      },
    })
    for (const message of Object.values(AUTH_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/[–—]|(vous|votre|vos)/i)
    }
  })

  it("déduit la raison d'une erreur 0.3 sans reason, et ignore les autres erreurs", () => {
    expect(authErrorReason(new ConvexError({ code: "UNAUTHENTICATED", message: "x" }))).toBe("no_session")
    expect(authErrorReason(new ConvexError({ code: "FORBIDDEN", message: "x" }))).toBe("not_member")
    expect(authErrorReason(new Error("rôle"))).toBeNull()
    expect(authErrorReason(new ConvexError({ code: "AUTRE" }))).toBeNull()
  })
})

describe("jetons de l'app de bureau", () => {
  const ACCOUNT = "https://account.hgdc.ch/api/auth"
  const env = { HGDC_APP_CLIENT_ID: "app-client" }
  // Identifiants Account (`sub`) des personnes connues du produit.
  const accounts: Record<string, string> = { "acc-ada": "ada", "acc-bob": "bob" }
  const resolveUser = async (_ctx: Ctx, accountUserId: string) => accounts[accountUserId] ?? null
  const app = appAccess<Ctx>(env, resolveUser)

  it("déclare un fournisseur RS256 par nom de l'émetteur, mêmes clés, limité à l'audience de l'app", () => {
    const provider = { type: "customJwt", jwks: `${ACCOUNT}/jwks`, algorithm: "RS256", applicationID: "app-client" }
    expect(appAuthProviders(env)).toEqual([
      { ...provider, issuer: ACCOUNT },
      { ...provider, issuer: "https://id.hgdc.ch/api/auth" },
    ])
    // Un Account d'essai garde un seul nom : jamais l'émetteur de production en plus.
    expect(appAuthProviders({ ...env, HGDC_ISSUER: "https://account.test/api/auth/" })).toEqual([
      { ...provider, issuer: "https://account.test/api/auth", jwks: "https://account.test/api/auth/jwks" },
    ])
    expect(appAuthProviders({})).toEqual([])
    expect(appAccess({}, resolveUser)).toBeUndefined()
  })

  it("accepte l'id_token de l'app sous le nom d'ID de l'émetteur (ADR 0015)", async () => {
    const access = await requireOrgMember(ctxFor("acc-ada", acme, "https://id.hgdc.ch/api/auth"), "acme", {
      load,
      issuer: ISSUER,
      app,
    })
    expect(access).toMatchObject({ userId: "ada", via: "app", accountUserId: "acc-ada" })
  })

  it("traduit l'identifiant Account en utilisateur du produit", async () => {
    const access = await requireOrgMember(ctxFor("acc-ada", acme, ACCOUNT), "acme", { load, issuer: ISSUER, app })
    expect(access).toMatchObject({ userId: "ada", via: "app", role: "owner", accountUserId: "acc-ada" })
    // `identity.subject` reste un identifiant du produit, quel que soit le chemin.
    expect(access.identity.subject).toBe("ada")
  })

  it("ne lit jamais le sub d'Account comme un identifiant du produit", async () => {
    // `ada` est un identifiant du produit, pas d'Account : aucune correspondance.
    await expect(
      requireOrgMember(ctxFor("ada", acme, ACCOUNT), "acme", { load, issuer: ISSUER, app }),
    ).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED", reason: "unknown_user" },
    })
  })

  it("garde le contrôle d'appartenance et de rôle", async () => {
    expect(
      await codeOf(
        requireOrgMember(ctxFor("acc-bob", acme, ACCOUNT), "acme", { load, issuer: ISSUER, app, minRole: "admin" }),
      ),
    ).toBe("FORBIDDEN")
    expect(
      await codeOf(requireOrgMember(ctxFor("acc-ada", acme, ACCOUNT), "autre", { load, issuer: ISSUER, app })),
    ).toBe("FORBIDDEN")
  })

  it("refuse les jetons d'Account quand le produit n'ouvre pas l'app", async () => {
    await expect(requireUser(ctxFor("acc-ada", [], ACCOUNT), { issuer: ISSUER })).rejects.toMatchObject({
      data: { reason: "wrong_issuer" },
    })
  })

  it("garde les jetons du produit tels quels", async () => {
    expect(await requireUser(ctxFor("ada", [], ISSUER), { issuer: ISSUER, app })).toMatchObject({
      userId: "ada",
      via: "session",
    })
    await expect(
      requireUser(ctxFor("ada", [], "https://autre.example"), { issuer: ISSUER, app }),
    ).rejects.toMatchObject({
      data: { reason: "wrong_issuer" },
    })
    await expect(requireUser(ctxFor(null, []), { issuer: ISSUER, app })).rejects.toMatchObject({
      data: { reason: "no_session" },
    })
  })

  it("exige https pour l'émetteur d'Account, sauf en local", () => {
    expect(() => appAuthProviders({ ...env, HGDC_ISSUER: "http://account.example/api/auth" })).toThrow(/https/)
    expect(() => appAccess({ ...env, HGDC_ISSUER: "http://account.example/api/auth" }, resolveUser)).toThrow(/https/)
    expect(appAuthProviders({ ...env, HGDC_ISSUER: "http://localhost:3200/api/auth" })[0]?.issuer).toBe(
      "http://localhost:3200/api/auth",
    )
    expect(() => appAuthProviders({ ...env, HGDC_ISSUER: "http://localhost.evil.example/api/auth" })).toThrow(/https/)
  })

  it("cherche le compte du seul fournisseur HGDC et lit son utilisateur", () => {
    expect(hgdcAccountLookup("acc-ada")).toEqual({
      model: "account",
      where: [
        { field: "accountId", value: "acc-ada" },
        { field: "providerId", value: "hgdc" },
      ],
    })
    expect(userIdOfAccount({ userId: "ada" })).toBe("ada")
    for (const row of [null, undefined, {}, { userId: "" }, { userId: 42 }, "ada"])
      expect(userIdOfAccount(row)).toBeNull()
  })

  it("refuse une configuration où l'app et le produit partagent un émetteur", async () => {
    await expect(requireUser(ctxFor("ada", [], ACCOUNT), { issuer: `${ACCOUNT}/`, app })).rejects.toThrow(/émetteur/)
  })
})
