import type { Infer } from "convex/values"
import { describe, expect, expectTypeOf, it } from "vitest"

import {
  ACCOUNT_EVENT_HEADERS,
  ACCOUNT_EVENT_MAX_BYTES,
  accountEventIsStale,
  accountEventOutcomeOf,
  handleAccountEventRequest,
  newAccountEventId,
  readBodyText,
  signAccountEvent,
  verifyAccountEvent,
  type AccountEvent,
  type AccountEventOutcome,
  type vAccountEvent,
  type vAccountEventOutcome,
} from "./events.ts"

const secret = "s".repeat(43)
const now = 1_800_000_000_000
const url = "https://produit.convex.site/hgdc/v1/account-events"
const audience = "host" as const
const expected = { secret, now, audience }

const removed: AccountEvent = {
  id: "0123456789abcdef0123456789abcdef",
  type: "member.removed",
  occurredAt: now - 1000,
  organizationId: "org1",
  userId: "sub1",
  reason: "removed",
}

async function signedRequest(
  event: AccountEvent = removed,
  options: { at?: number; key?: string; to?: "host" | "mail"; legacy?: boolean } = {},
) {
  const { body, headers } = await signAccountEvent(event, {
    secret: options.key ?? secret,
    now: options.at ?? now,
    audience: options.to ?? audience,
    legacy: options.legacy,
  })
  return { body, headers, request: new Request(url, { method: "POST", headers, body }) }
}

async function hmacHex(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

describe("signAccountEvent / verifyAccountEvent", () => {
  it("accepte une requête signée pour ce produit et rend l'événement", async () => {
    const { request, headers } = await signedRequest()
    expect(headers[ACCOUNT_EVENT_HEADERS.signature]).toMatch(/^v2=[0-9a-f]{64}$/)
    expect(headers[ACCOUNT_EVENT_HEADERS.audience]).toBe("host")
    expect(await verifyAccountEvent(request, expected)).toEqual({ ok: true, event: removed })
  })

  it("accepte chaque type d'événement", async () => {
    const events: AccountEvent[] = [
      { ...removed, reason: "left" },
      { id: removed.id, type: "member.role_changed", occurredAt: now, organizationId: "o", userId: "u", role: "admin" },
      { id: removed.id, type: "organization.deleted", occurredAt: now, organizationId: "o" },
    ]
    for (const event of events) {
      const { request } = await signedRequest(event)
      expect(await verifyAccountEvent(request, expected)).toEqual({ ok: true, event })
    }
  })

  it("refuse un événement signé pour un autre produit, même avec le même secret", async () => {
    const { request } = await signedRequest(removed, { to: "mail" })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un en-tête d'audience changé (elle est dans le MAC)", async () => {
    const { body, headers } = await signedRequest(removed, { to: "mail" })
    const request = new Request(url, {
      method: "POST",
      headers: { ...headers, [ACCOUNT_EVENT_HEADERS.audience]: "host" },
      body,
    })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
  })

  it("format de transition (`legacy`) : v1 et v2 envoyés, seul v2 compte", async () => {
    const { request, headers } = await signedRequest(removed, { legacy: true })
    expect(headers[ACCOUNT_EVENT_HEADERS.signature]).toMatch(/^v1=/)
    expect(headers[ACCOUNT_EVENT_HEADERS.signatureV2]).toMatch(/^v2=/)
    expect(await verifyAccountEvent(request, expected)).toEqual({ ok: true, event: removed })
  })

  it("refuse l'ancien format v1 seul (sans audience)", async () => {
    const { body, headers } = await signedRequest(removed, { legacy: true })
    const { [ACCOUNT_EVENT_HEADERS.signatureV2]: _v2, ...v1Only } = headers
    const request = new Request(url, { method: "POST", headers: v1Only, body })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un autre secret", async () => {
    const { request } = await signedRequest(removed, { key: "t".repeat(43) })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un corps altéré", async () => {
    const { body, headers } = await signedRequest()
    const request = new Request(url, { method: "POST", headers, body: body.replace('"sub1"', '"sub2"') })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un identifiant d'en-tête changé (il est dans le MAC)", async () => {
    const { body, headers } = await signedRequest()
    const request = new Request(url, {
      method: "POST",
      headers: { ...headers, [ACCOUNT_EVENT_HEADERS.id]: "ffffffffffffffffffffffffffffffff" },
      body,
    })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
  })

  it("refuse un horodatage hors de la fenêtre de 5 minutes, dans les deux sens", async () => {
    for (const at of [now - 301_000, now + 301_000]) {
      const { request } = await signedRequest(removed, { at })
      expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
    }
    const { request } = await signedRequest(removed, { at: now - 299_000 })
    expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: true })
  })

  it("refuse un occurredAt à plus de 5 minutes dans le futur", async () => {
    const future = { ...removed, occurredAt: now + 301_000 }
    expect(await verifyAccountEvent((await signedRequest(future)).request, expected)).toMatchObject({
      ok: false,
      status: 400,
    })
    const soon = { ...removed, occurredAt: now + 299_000 }
    expect(await verifyAccountEvent((await signedRequest(soon)).request, expected)).toMatchObject({ ok: true })
  })

  it("refuse une signature absente ou mal formée", async () => {
    const { body, headers } = await signedRequest()
    for (const signature of ["", "v2=", "v1=abc", headers[ACCOUNT_EVENT_HEADERS.signature]!.toUpperCase()]) {
      const request = new Request(url, {
        method: "POST",
        headers: { ...headers, [ACCOUNT_EVENT_HEADERS.signature]: signature },
        body,
      })
      expect(await verifyAccountEvent(request, expected)).toMatchObject({ ok: false, status: 401 })
    }
  })

  it("refuse un corps trop grand, déclaré ou non", async () => {
    const big = "x".repeat(ACCOUNT_EVENT_MAX_BYTES + 1)
    expect(await verifyAccountEvent(new Request(url, { method: "POST", body: big }), expected)).toMatchObject({
      ok: false,
      status: 413,
    })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode("x".repeat(1024)))
        controller.close()
      },
    })
    const chunked = new Request(url, { method: "POST", body: stream, duplex: "half" } as RequestInit)
    expect(await verifyAccountEvent(chunked, expected)).toMatchObject({ ok: false, status: 413 })
  })

  it("refuse un corps signé mais invalide, ou dont l'id diffère de l'en-tête", async () => {
    const timestamp = String(Math.floor(now / 1000))
    const sign = async (body: string, eventId = removed.id) =>
      new Request(url, {
        method: "POST",
        headers: {
          [ACCOUNT_EVENT_HEADERS.id]: eventId,
          [ACCOUNT_EVENT_HEADERS.timestamp]: timestamp,
          [ACCOUNT_EVENT_HEADERS.audience]: audience,
          [ACCOUNT_EVENT_HEADERS.signature]: `v2=${await hmacHex(`v2.${audience}.${eventId}.${timestamp}.${body}`)}`,
        },
        body,
      })
    for (const body of [
      "pas du json",
      JSON.stringify({ ...removed, role: "owner" }),
      JSON.stringify({ ...removed, type: "x" }),
    ])
      expect(await verifyAccountEvent(await sign(body), expected)).toMatchObject({ ok: false, status: 400 })
    expect(
      await verifyAccountEvent(await sign(JSON.stringify(removed), "ffffffffffffffffffffffffffffffff"), expected),
    ).toMatchObject({ ok: false, status: 400 })
  })

  it("exige un secret assez long et une audience connue", async () => {
    await expect(signAccountEvent(removed, { secret: "court", now, audience })).rejects.toThrow(/trop court/)
    const { request } = await signedRequest()
    await expect(verifyAccountEvent(request, { ...expected, secret: "court" })).rejects.toThrow(/trop court/)
    await expect(signAccountEvent(removed, { secret, now, audience: "inconnu" as unknown as "host" })).rejects.toThrow(
      /Audience/,
    )
  })

  it("refuse de signer un événement invalide", async () => {
    await expect(signAccountEvent({ ...removed, id: "court" }, { secret, now, audience })).rejects.toThrow(
      /Too small|Invalid|id/,
    )
  })
})

describe("readBodyText", () => {
  it("lit un corps sous le plafond et s'arrête au-delà", async () => {
    expect(await readBodyText(new Request(url, { method: "POST", body: "é" }), 2)).toEqual({ ok: true, text: "é" })
    expect(await readBodyText(new Request(url, { method: "POST", body: "éé" }), 3)).toEqual({
      ok: false,
      reason: "too_large",
    })
    expect(await readBodyText(new Request(url, { method: "POST" }), 3)).toEqual({ ok: true, text: "" })
  })
})

describe("handleAccountEventRequest", () => {
  const run = async (request: Request, outcome: AccountEventOutcome = "applied") => {
    const applied: AccountEvent[] = []
    const response = await handleAccountEventRequest(request, {
      audience,
      secret,
      now,
      apply: async (event) => {
        applied.push(event)
        return outcome
      },
    })
    return { response, applied }
  }

  it("applique un événement valide et rend l'issue", async () => {
    const { response, applied } = await run((await signedRequest()).request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "applied" })
    expect(applied).toEqual([removed])
  })

  it("rend une issue ignorée avec sa raison", async () => {
    const { response } = await run((await signedRequest()).request, "ignored:unknown_user")
    expect(await response.json()).toEqual({ status: "ignored", reason: "unknown_user" })
  })

  it("rend le doublon tel que la mutation le signale (rejeu du même id)", async () => {
    const { response } = await run((await signedRequest(removed, { at: now + 1000 })).request, "duplicate")
    expect(await response.json()).toEqual({ status: "duplicate" })
  })

  it("401 sans appeler apply sur une signature invalide ou une autre audience", async () => {
    for (const request of [
      (await signedRequest(removed, { key: "t".repeat(43) })).request,
      (await signedRequest(removed, { to: "mail" })).request,
    ]) {
      const { response, applied } = await run(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: "unauthorized" })
      expect(applied).toEqual([])
    }
  })

  it("503 tant que le secret n'est pas posé", async () => {
    const response = await handleAccountEventRequest((await signedRequest()).request, {
      audience,
      secret: undefined,
      now,
      apply: async () => "applied",
    })
    expect(response.status).toBe(503)
  })
})

describe("accountEventOutcomeOf", () => {
  it("lit la réponse d'un produit", () => {
    expect(accountEventOutcomeOf({ status: "applied" })).toBe("applied")
    expect(accountEventOutcomeOf({ status: "duplicate" })).toBe("duplicate")
    expect(accountEventOutcomeOf({ status: "ignored", reason: "stale" })).toBe("ignored:stale")
    expect(accountEventOutcomeOf({ status: "ignored", reason: "autre" })).toBeNull()
    // Réponse d'un produit d'avant 0.9 : illisible.
    expect(accountEventOutcomeOf({ status: "ignored" })).toBeNull()
    expect(accountEventOutcomeOf(null)).toBeNull()
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
    await expect(signAccountEvent({ ...removed, id: a }, { secret, now, audience })).resolves.toBeTruthy()
  })
})

describe("validateurs Convex", () => {
  it("décrivent les mêmes types que le module", () => {
    expectTypeOf<Infer<typeof vAccountEvent>>().toEqualTypeOf<AccountEvent>()
    expectTypeOf<Infer<typeof vAccountEventOutcome>>().toEqualTypeOf<AccountEventOutcome>()
  })
})
