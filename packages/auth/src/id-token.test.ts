import { describe, expect, it } from "vitest"

import {
  HgdcIdTokenError,
  ID_TOKEN_MAX_AGE_SECONDS,
  KEY_MEMBERSHIP_TTL_MS,
  MEMBERSHIP_TTL_MS,
  SESSION_TTL_SECONDS,
  membershipIsFresh,
  verifiedOrganizationsFromIdToken,
  verifyHgdcIdToken,
  type IdTokenRejection,
} from "./index.ts"

const ISSUER = "https://account.hgdc.ch/api/auth"
const CLIENT = "host"
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)
const nowSeconds = NOW / 1000
const orgs = [{ id: "o1", slug: "acme", name: "Acme SA", role: "admin" }]

const token = (payload: unknown) =>
  ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".")

const valid = { iss: ISSUER, aud: CLIENT, sub: "u1", iat: nowSeconds - 5, exp: nowSeconds + 3600, organizations: orgs }
const expected = { issuer: ISSUER, clientId: CLIENT, now: NOW }

function rejection(idToken: string, options = expected): IdTokenRejection | "OK" {
  try {
    verifyHgdcIdToken(idToken, options)
    return "OK"
  } catch (error) {
    if (error instanceof HgdcIdTokenError) return error.reason
    throw error
  }
}

describe("verifiedOrganizationsFromIdToken", () => {
  it("rend les organisations d'un jeton d'Account frais destiné au produit", () => {
    expect(verifiedOrganizationsFromIdToken(token(valid), expected)).toEqual(orgs)
  })

  it("rend une liste vide sans la portée organizations", () => {
    expect(verifiedOrganizationsFromIdToken(token({ ...valid, organizations: undefined }), expected)).toEqual([])
  })

  it("rend aussi les claims du profil", () => {
    expect(verifyHgdcIdToken(token(valid), expected).claims.sub).toBe("u1")
  })
})

describe("verifyHgdcIdToken : émetteur", () => {
  it("refuse un autre émetteur", () => {
    expect(rejection(token({ ...valid, iss: "https://autre.example/api/auth" }))).toBe("wrong_issuer")
  })

  it("refuse un jeton sans émetteur", () => {
    expect(rejection(token({ ...valid, iss: undefined }))).toBe("wrong_issuer")
  })

  it("accepte l'émetteur avec ou sans barre finale", () => {
    expect(rejection(token({ ...valid, iss: `${ISSUER}/` }))).toBe("OK")
    expect(rejection(token(valid), { ...expected, issuer: `${ISSUER}/` })).toBe("OK")
  })

  it("refuse de tourner sans émetteur ni clientId attendus", () => {
    expect(() => verifyHgdcIdToken(token(valid), { ...expected, clientId: "" })).toThrow(/clientId/)
    expect(() => verifyHgdcIdToken(token(valid), { ...expected, issuer: "" })).toThrow(/émetteur/)
  })
})

describe("verifyHgdcIdToken : audience", () => {
  it("refuse un jeton destiné à un autre produit", () => {
    expect(rejection(token({ ...valid, aud: "mail" }))).toBe("wrong_audience")
  })

  it("accepte une liste d'audiences avec azp égal au client", () => {
    expect(rejection(token({ ...valid, aud: ["host", "api"], azp: CLIENT }))).toBe("OK")
  })

  it("refuse une liste d'audiences sans azp du client", () => {
    expect(rejection(token({ ...valid, aud: ["host", "mail"] }))).toBe("wrong_audience")
    expect(rejection(token({ ...valid, aud: ["host", "mail"], azp: "mail" }))).toBe("wrong_audience")
  })
})

describe("verifyHgdcIdToken : fraîcheur", () => {
  it(`accepte un jeton de ${ID_TOKEN_MAX_AGE_SECONDS / 60} minutes tout juste`, () => {
    expect(rejection(token({ ...valid, iat: nowSeconds - ID_TOKEN_MAX_AGE_SECONDS }))).toBe("OK")
  })

  it("refuse un jeton émis il y a plus de 10 minutes", () => {
    expect(rejection(token({ ...valid, iat: nowSeconds - ID_TOKEN_MAX_AGE_SECONDS - 1 }))).toBe("stale")
  })

  it("tolère une minute d'avance d'horloge, pas plus", () => {
    expect(rejection(token({ ...valid, iat: nowSeconds + 60 }))).toBe("OK")
    expect(rejection(token({ ...valid, iat: nowSeconds + 61 }))).toBe("stale")
  })

  it("refuse un jeton sans iat ou expiré", () => {
    expect(rejection(token({ ...valid, iat: undefined }))).toBe("stale")
    expect(rejection(token({ ...valid, iat: "1760000000" }))).toBe("stale")
    expect(rejection(token({ ...valid, exp: nowSeconds - 120 }))).toBe("stale")
  })

  it("refuse un instant passé en secondes au lieu de millisecondes", () => {
    expect(rejection(token(valid), { ...expected, now: nowSeconds })).toBe("stale")
  })
})

describe("verifyHgdcIdToken : contenu", () => {
  it("refuse un jeton illisible", () => {
    expect(rejection("pas-un-jeton")).toBe("unreadable")
    expect(rejection("a.%%%.b")).toBe("unreadable")
    expect(rejection(token([1, 2]))).toBe("unreadable")
  })

  it("refuse un rôle inconnu", () => {
    const odd = [{ id: "o1", slug: "a", name: "A", role: "superadmin" }]
    expect(rejection(token({ ...valid, organizations: odd }))).toBe("invalid_claims")
  })
})

describe("membershipIsFresh", () => {
  const day = 24 * 60 * 60 * 1000

  it("garde le modèle : session de 7 jours, copie valable 8 jours, clés 30 jours", () => {
    expect(SESSION_TTL_SECONDS).toBe(7 * 24 * 60 * 60)
    expect(MEMBERSHIP_TTL_MS).toBe(8 * day)
    expect(KEY_MEMBERSHIP_TTL_MS).toBe(30 * day)
    expect(MEMBERSHIP_TTL_MS).toBeGreaterThan(SESSION_TTL_SECONDS * 1000)
  })

  it("accepte une copie confirmée il y a 8 jours tout juste, refuse au-delà", () => {
    expect(membershipIsFresh({ syncedAt: NOW - 8 * day }, NOW)).toBe(true)
    expect(membershipIsFresh({ syncedAt: NOW - 8 * day - 1 }, NOW)).toBe(false)
  })

  it("refuse une copie sans date de synchronisation", () => {
    expect(membershipIsFresh({}, NOW)).toBe(false)
    expect(membershipIsFresh({ syncedAt: null }, NOW)).toBe(false)
  })

  it("prend un délai propre aux clés d'API", () => {
    expect(membershipIsFresh({ syncedAt: NOW - 20 * day }, NOW)).toBe(false)
    expect(membershipIsFresh({ syncedAt: NOW - 20 * day }, NOW, KEY_MEMBERSHIP_TTL_MS)).toBe(true)
  })
})
