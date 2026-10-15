import { describe, expect, it, vi } from "vitest"

import {
  buildEnvelope,
  createRateLimit,
  isReportable,
  parseDsn,
  scrub,
  sendErrorReport,
  stackFrames,
  type EnvelopeOptions,
} from "./index.ts"

const DSN = "https://abc123@errors.example.net:10000/4"
const TOKEN = "a".repeat(43)

const ENVELOPE: EnvelopeOptions = {
  dsn: DSN,
  eventId: "e1",
  now: 1_700_000_000_000,
  environment: "production",
  serverName: "hip-monitor-87",
  platform: "node",
}

function eventOf(envelope: string) {
  const [header = "", item = "", body = ""] = envelope.split("\n")
  return { header: JSON.parse(header), item: JSON.parse(item), event: JSON.parse(body) }
}

describe("parseDsn", () => {
  it("lit la clé, l'hôte, le préfixe et le projet", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://errors.example.net:10000/api/4/envelope/",
      publicKey: "abc123",
      dsn: DSN,
    })
    expect(parseDsn("https://k@example.net/glitchtip/7")?.endpoint).toBe(
      "https://example.net/glitchtip/api/7/envelope/",
    )
  })

  it("éteint la remontée sur tout ce qui n'est pas un DSN", () => {
    for (const value of [
      undefined,
      "",
      "pas une url",
      "https://errors.example.net/4",
      "https://k@errors.example.net/projet",
      "ftp://k@h/1",
    ])
      expect(parseDsn(value), String(value)).toBeNull()
  })
})

describe("scrub", () => {
  it("masque e-mails et jetons de partage", () => {
    expect(scrub(`hugo@example.ch a ouvert /partage/${TOKEN}`)).toBe("[email] a ouvert /partage/[jeton]")
  })

  it("masque les adresses IPv4 et IPv6, pas les heures ni les positions de pile", () => {
    expect(scrub("connect ECONNREFUSED 203.0.113.7:3000")).toBe("connect ECONNREFUSED [ip]:3000")
    expect(scrub("depuis 2001:db8:85a3::8a2e:370:7334 et fe80::1")).toBe("depuis [ip] et [ip]")
    expect(scrub("visiteur 2001:0db8:0000:0000:0000:ff00:0042:8329")).toBe("visiteur [ip]")
    expect(scrub("à 14:32:05 dans main.ts:12:34")).toBe("à 14:32:05 dans main.ts:12:34")
  })

  it("masque les identifiants d'une URL de connexion", () => {
    expect(scrub("échec postgres://umami:motdepasse@db:5432/umami")).toBe(
      "échec postgres://[identifiants]@db:5432/umami",
    )
  })

  it("masque les paramètres sensibles d'une requête, pas les autres", () => {
    expect(scrub("GET /invite?token=abc&page=2#code=xyz")).toBe("GET /invite?token=[masqué]&page=2#code=[masqué]")
  })

  it("masque les en-têtes d'autorisation et les clés à préfixe", () => {
    expect(scrub("Authorization: Bearer eyJhbGciOi.payload.sig")).toBe("Authorization: Bearer [jeton]")
    // Construite à l'exécution : une vraie forme de clé dans le source alerterait gitleaks.
    const key = ["sk", "live", "51HxQzABCDEFGHIJKLMN"].join("_")
    expect(scrub(`clé ${key} refusée`)).toBe("clé [clé] refusée")
    expect(scrub("clé am_court refusée", { keyPrefixes: ["am_"] })).toBe("clé [clé] refusée")
    expect(scrub("deployment_status_changed")).toBe("deployment_status_changed")
  })
})

describe("stackFrames", () => {
  it("garde les cadres, jamais la ligne du message", () => {
    const frames = stackFrames(
      "Error: secret hugo@example.ch\n    at handler (convex/stats.ts:42:7)\n    at run (x.js:1:1)",
    )
    expect(frames).toBe("    at handler (convex/stats.ts:42:7)\n    at run (x.js:1:1)")
  })

  it("lit aussi les piles de Firefox et Safari", () => {
    expect(stackFrames("handler@https://app.example.ch/a.js:1:2\nrien")).toBe("handler@https://app.example.ch/a.js:1:2")
    expect(stackFrames(undefined)).toBeUndefined()
    expect(stackFrames("Error: sans cadre")).toBeUndefined()
  })
})

describe("isReportable", () => {
  it("tait une ConvexError, remonte le reste", () => {
    const convexError = Object.assign(new Error("Ce nom est déjà pris"), { name: "ConvexError" })
    expect(isReportable(convexError)).toBe(false)
    expect(isReportable(new TypeError("x"))).toBe(true)
    expect(isReportable("x")).toBe(true)
  })
})

describe("buildEnvelope", () => {
  it("écrit en-tête, type et événement nettoyé et borné", () => {
    const { header, item, event } = eventOf(
      buildEnvelope(
        {
          source: "umami",
          error: new TypeError(`échec pour hugo@example.ch ${"x".repeat(400)}`),
          context: { path: "/api/websites", visitor: "hugo@example.ch", status: 502, skip: undefined },
        },
        { ...ENVELOPE, release: "abc1234" },
      ),
    )
    expect(header).toMatchObject({ event_id: "e1", dsn: DSN })
    expect(item).toEqual({ type: "event" })
    expect(event.exception.values[0].type).toBe("TypeError")
    expect(event.exception.values[0].value).not.toContain("@example.ch")
    expect(event.exception.values[0].value.length).toBeLessThanOrEqual(300)
    expect(event.tags).toEqual({ source: "umami" })
    expect(event.release).toBe("abc1234")
    expect(event.extra).toMatchObject({ path: "/api/websites", visitor: "[email]", status: 502 })
    expect("skip" in event.extra).toBe(false)
  })

  it("regroupe les occurrences d'un même défaut malgré les nombres", () => {
    const one = eventOf(buildEnvelope({ source: "http", error: new Error("HTTP 502 après 1200 ms") }, ENVELOPE))
    const two = eventOf(buildEnvelope({ source: "http", error: new Error("HTTP 504 après 30 ms") }, ENVELOPE))
    expect(one.event.fingerprint).toEqual(two.event.fingerprint)
    expect("release" in one.event).toBe(false)
  })

  it("décrit ce qui n'est pas une Error", () => {
    expect(eventOf(buildEnvelope({ source: "x", error: { code: 42 } }, ENVELOPE)).event.message.formatted).toBe(
      'Error: {"code":42}',
    )
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(eventOf(buildEnvelope({ source: "x", error: circular }, ENVELOPE)).event.message.formatted).toBe(
      "Error: [object Object]",
    )
  })
})

describe("sendErrorReport", () => {
  it("poste l'enveloppe au point de réception avec la clé, sans requête préalable CORS", async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    )
    expect(await sendErrorReport({ source: "test", error: new Error("boom") }, { dsn: DSN, fetchImpl })).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe("https://errors.example.net:10000/api/4/envelope/?sentry_key=abc123&sentry_version=7")
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" } })
  })

  it("ne fait rien sans DSN, et ne rejette jamais", async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
      throw new Error("réseau")
    })
    expect(await sendErrorReport({ source: "test", error: "x" }, { dsn: undefined, fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await sendErrorReport({ source: "test", error: "x" }, { dsn: DSN, fetchImpl })).toBe(false)
  })

  it("rend faux quand GlitchTip refuse", async () => {
    const fetchImpl = async () => new Response("quota", { status: 429 })
    expect(await sendErrorReport({ source: "test", error: "x" }, { dsn: DSN, fetchImpl })).toBe(false)
  })
})

describe("createRateLimit", () => {
  it("une remontée par source et par minute, un plafond horaire en tout", () => {
    let t = 1_000_000
    const allow = createRateLimit({ perHour: 3, now: () => t })
    expect([allow("umami"), allow("umami"), allow("convex")]).toEqual([true, false, true])
    t += 61_000
    expect(allow("umami")).toBe(true)
    t += 61_000
    expect(allow("purge")).toBe(false)
    t += 60 * 60_000
    expect(allow("purge")).toBe(true)
  })
})
