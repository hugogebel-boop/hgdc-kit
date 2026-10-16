import type { Infer } from "convex/values"
import { describe, expect, expectTypeOf, it } from "vitest"

import {
  ACCOUNT_EVENT_HEADERS,
  ACCOUNT_EVENT_MAX_BYTES,
  accountEventIsStale,
  handleAccountEventRequest,
  newAccountEventId,
  signAccountEvent,
  verifyAccountEvent,
  type AccountEvent,
  type vAccountEvent,
} from "./events.ts"

const secret = "s".repeat(43)
const now = 1_800_000_000_000
const url = "https://produit.convex.site/hgdc/v1/account-events"

const removed: AccountEvent = {
  id: "0123456789abcdef0123456789abcdef",
  type: "member.removed",
  occurredAt: now - 1000,
  organizationId: "org1",
  userId: "sub1",
  reason: "removed",
}

async function signedRequest(event: AccountEvent = removed, at = now, key = secret) {
  const { body, headers } = await signAccountEvent(event, { secret: key, now: at })
  return { body, headers, request: new Request(url, { method: "POST", headers, body }) }
}

describe("signAccountEvent / verifyAccountEvent", () => {
  it("accepte une requête signée et rend l'événement", async () => {
    const { request, headers } = await signedRequest()
    expect(headers[ACCOUNT_EVENT_HEADERS.signature]).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(await verifyAccountEvent(request, { secret, now })).toEqual({ ok: true, event: removed })
  })

  it("accepte chaque type d'événement", async () => {
    const events: AccountEvent[] = [
      { ...removed, reason: "left" },
      { id: removed.id, type: "member.role_changed", occurredAt: now, organizationId: "o", userId: "u", role: "admin" },
      { id: removed.id, type: "organization.deleted", occurredAt: now, organizationId: "o" },
    ]
    for (const event of events) {
      const { request } = await signedRequest(event)
      expect(await verifyAccountEvent(request, { secret, now })).toEqual({ ok: true, event })
    }
  })

  it("refuse un autre secret", async () => {
    const { request } = await signedRequest(removed, now, "t".repeat(43))
    expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un corps altéré", async () => {
    const { body, headers } = await signedRequest()
    const altered = body.replace('"sub1"', '"sub2"')
    const request = new Request(url, { method: "POST", headers, body: altered })
    expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un identifiant d'en-tête changé (il est dans le MAC)", async () => {
    const { body, headers } = await signedRequest()
    const request = new Request(url, {
      method: "POST",
      headers: { ...headers, [ACCOUNT_EVENT_HEADERS.id]: "ffffffffffffffffffffffffffffffff" },
      body,
    })
    expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un horodatage hors de la fenêtre de 5 minutes, dans les deux sens", async () => {
    for (const at of [now - 301_000, now + 301_000]) {
      const { request } = await signedRequest(removed, at)
      expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: false, status: 401 })
    }
    const { request } = await signedRequest(removed, now - 299_000)
    expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: true })
  })

  it("refuse une signature absente ou mal formée", async () => {
    const { body, headers } = await signedRequest()
    for (const signature of ["", "v1=", "v0=abc", headers[ACCOUNT_EVENT_HEADERS.signature]!.toUpperCase()]) {
      const request = new Request(url, {
        method: "POST",
        headers: { ...headers, [ACCOUNT_EVENT_HEADERS.signature]: signature },
        body,
      })
      expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: false, status: 401 })
    }
  })

  it("refuse un corps trop grand avant de calculer quoi que ce soit", async () => {
    const request = new Request(url, { method: "POST", body: "x".repeat(ACCOUNT_EVENT_MAX_BYTES + 1) })
    expect(await verifyAccountEvent(request, { secret, now })).toMatchObject({ ok: false, status: 413 })
  })

  it("refuse un corps signé mais invalide, ou dont l'id diffère de l'en-tête", async () => {
    const id = removed.id
    const timestamp = String(Math.floor(now / 1000))
    const sign = async (body: string, eventId = id) => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      )
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${eventId}.${timestamp}.${body}`))
      const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")
      return new Request(url, {
        method: "POST",
        headers: {
          [ACCOUNT_EVENT_HEADERS.id]: eventId,
          [ACCOUNT_EVENT_HEADERS.timestamp]: timestamp,
          [ACCOUNT_EVENT_HEADERS.signature]: `v1=${hex}`,
        },
        body,
      })
    }
    for (const body of [
      "pas du json",
      JSON.stringify({ ...removed, role: "owner" }),
      JSON.stringify({ ...removed, type: "x" }),
    ])
      expect(await verifyAccountEvent(await sign(body), { secret, now })).toMatchObject({ ok: false, status: 400 })
    const otherId = "ffffffffffffffffffffffffffffffff"
    expect(await verifyAccountEvent(await sign(JSON.stringify(removed), otherId), { secret, now })).toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it("exige un secret assez long des deux côtés", async () => {
    await expect(signAccountEvent(removed, { secret: "court", now })).rejects.toThrow(/trop court/)
    const { request } = await signedRequest()
    await expect(verifyAccountEvent(request, { secret: "court", now })).rejects.toThrow(/trop court/)
  })

  it("refuse de signer un événement invalide", async () => {
    await expect(signAccountEvent({ ...removed, id: "court" }, { secret, now })).rejects.toThrow(/Too small|Invalid|id/)
  })
})

describe("handleAccountEventRequest", () => {
  it("applique un événement valide et rend le résultat", async () => {
    const { request } = await signedRequest()
    const applied: AccountEvent[] = []
    const response = await handleAccountEventRequest(request, {
      secret,
      now,
      apply: async (event) => {
        applied.push(event)
        return "applied"
      },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "applied" })
    expect(applied).toEqual([removed])
  })

  it("rend le doublon tel que la mutation le signale (rejeu du même id)", async () => {
    const seen = new Set<string>()
    const apply = async (event: AccountEvent) => {
      if (seen.has(event.id)) return "duplicate" as const
      seen.add(event.id)
      return "applied" as const
    }
    const first = await handleAccountEventRequest((await signedRequest()).request, { secret, now, apply })
    const replay = await handleAccountEventRequest((await signedRequest(removed, now + 1000)).request, {
      secret,
      now,
      apply,
    })
    expect(await first.json()).toEqual({ status: "applied" })
    expect(await replay.json()).toEqual({ status: "duplicate" })
  })

  it("401 sans appeler apply sur une signature invalide", async () => {
    const { request } = await signedRequest(removed, now, "t".repeat(43))
    let called = false
    const response = await handleAccountEventRequest(request, {
      secret,
      now,
      apply: async () => {
        called = true
        return "applied"
      },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(called).toBe(false)
  })

  it("503 tant que le secret n'est pas posé", async () => {
    const { request } = await signedRequest()
    const response = await handleAccountEventRequest(request, { secret: undefined, now, apply: async () => "applied" })
    expect(response.status).toBe(503)
  })
})

describe("accountEventIsStale", () => {
  it("écarte un événement plus ancien que la dernière confirmation d'Account", () => {
    expect(accountEventIsStale({ occurredAt: 10 }, 20)).toBe(true)
    expect(accountEventIsStale({ occurredAt: 20 }, 10)).toBe(false)
    expect(accountEventIsStale({ occurredAt: 20 }, 20)).toBe(false)
    expect(accountEventIsStale({ occurredAt: 20 }, undefined)).toBe(false)
    expect(accountEventIsStale({ occurredAt: 20 }, null)).toBe(false)
  })
})

describe("newAccountEventId", () => {
  it("rend un identifiant accepté par le schéma, différent à chaque appel", async () => {
    const a = newAccountEventId()
    expect(a).not.toBe(newAccountEventId())
    await expect(signAccountEvent({ ...removed, id: a }, { secret, now })).resolves.toBeTruthy()
  })
})

describe("vAccountEvent", () => {
  it("décrit le même type que le schéma Zod", () => {
    expectTypeOf<Infer<typeof vAccountEvent>>().toEqualTypeOf<AccountEvent>()
  })
})
