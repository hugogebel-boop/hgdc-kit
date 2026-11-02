import { ConvexError } from "convex/values"
import { describe, expect, it, vi } from "vitest"

import {
  DEMO_ACCESS,
  DEMO_ENTRY_READER,
  DEMO_ORGANIZATION_ID,
  DEMO_READ_ONLY,
  demoBusyMessage,
  demoEntryAddressKey,
  demoEntryIp,
  demoEntryReader,
  demoEntryRequest,
  DEMO_ENTRY_PROOF_TTL_MS,
  enterDemo,
  isDemoOrganization,
  isDemoPath,
  isDemoReadOnly,
  readOrgOrDemo,
  refuseDemo,
  runDemoReset,
  takeDemoEntry,
  type DemoEntryLimit,
} from "./demo.ts"

type Fetch = (url: string, init: RequestInit) => Promise<Response>

const SECRET = "un-secret-de-relais-assez-long"
const NOW = Date.UTC(2026, 10, 2, 8, 0)

describe("identification", () => {
  it("ne reconnaît que l'identifiant fixe", () => {
    expect(isDemoOrganization(DEMO_ORGANIZATION_ID)).toBe(true)
    for (const other of ["hgdc-demo ", "HGDC-DEMO", "~demo", "", null, undefined])
      expect(isDemoOrganization(other)).toBe(false)
  })

  it("reconnaît les pages de la démo, `~` encodé ou non", () => {
    expect(isDemoPath("/o/~demo")).toBe(true)
    expect(isDemoPath("/docs/o/%7Edemo/p/x")).toBe(true)
    expect(isDemoPath("/o/~demonstration")).toBe(false)
    expect(isDemoPath("/o/acme")).toBe(false)
    expect(isDemoPath("/o/acme/x/o/~demo")).toBe(false)
    expect(isDemoPath("/a/b/o/~demo")).toBe(false)
  })
})

describe("garde", () => {
  it("refuse la démo par son code, et rien d'autre", () => {
    expect(() => refuseDemo("acme")).not.toThrow()
    let caught: unknown
    try {
      refuseDemo(DEMO_ORGANIZATION_ID, "Lecture seule, connecte-toi.")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ConvexError)
    expect((caught as ConvexError<{ code: string; message: string }>).data).toEqual({
      code: DEMO_READ_ONLY,
      message: "Lecture seule, connecte-toi.",
    })
    expect(isDemoReadOnly(caught)).toBe(true)
    expect(isDemoReadOnly(new ConvexError({ code: "NOT_FOUND" }))).toBe(false)
    expect(isDemoReadOnly(new Error(DEMO_READ_ONLY))).toBe(false)
  })

  it("ouvre la démo sans appeler la garde, et garde toute autre organisation", async () => {
    const guard = vi.fn<(organizationId: string) => Promise<{ userId: string; role: "admin"; organizationId: string }>>(
      async (organizationId) => ({ userId: "u1", role: "admin" as const, organizationId }),
    )
    expect(await readOrgOrDemo(DEMO_ORGANIZATION_ID, guard)).toEqual(DEMO_ACCESS)
    expect(guard).not.toHaveBeenCalled()
    expect(await readOrgOrDemo("acme", guard)).toEqual({ userId: "u1", role: "admin", organizationId: "acme" })
    const refusing = async () => {
      throw new Error("no_session")
    }
    await expect(readOrgOrDemo("acme", refusing)).rejects.toThrow("no_session")
  })

  it("donne au visiteur le rôle membre, sans identité réelle", () => {
    expect(DEMO_ACCESS).toEqual({
      demo: true,
      organizationId: DEMO_ORGANIZATION_ID,
      userId: "demo:visitor",
      role: "member",
    })
    expect(Object.isFrozen(DEMO_ACCESS)).toBe(true)
  })
})

describe("entrée", () => {
  it("regroupe une IPv6 par /64 et garde l'IPv4 entière", () => {
    expect(demoEntryAddressKey("2001:db8:1:2:aaaa::1")).toBe("2001:0db8:0001:0002::/64")
    expect(demoEntryAddressKey("2001:db8:1:2::ffff")).toBe("2001:0db8:0001:0002::/64")
    expect(demoEntryAddressKey("::ffff:192.0.2.7")).toBe("192.0.2.7")
    expect(demoEntryAddressKey("192.0.2.7")).toBe("192.0.2.7")
    expect(demoEntryAddressKey("192.0.2.7:51234")).toBe("192.0.2.7")
    expect(demoEntryAddressKey("[2001:db8:1:2::9]:443")).toBe("2001:0db8:0001:0002::/64")
    expect(demoEntryAddressKey("::ffff:c000:207")).toBe("192.0.2.7")
    expect(demoEntryAddressKey("0:0:0:0:0:ffff:192.0.2.7")).toBe("192.0.2.7")
    expect(demoEntryAddressKey("fe80::1%eth0")).toBe("fe80:0000:0000:0000::/64")
    expect(demoEntryAddressKey("1:2:3:4:5:6:7:8:9")).toBe("1:2:3:4:5:6:7:8:9")
  })

  it("lit l'IP posée par la plateforme, jamais x-forwarded-for", () => {
    expect(demoEntryIp(new Headers({ "x-real-ip": " 192.0.2.7 " }))).toBe("192.0.2.7")
    expect(demoEntryIp(new Headers({ "x-forwarded-for": "192.0.2.7" }))).toBeNull()
    expect(demoEntryIp(new Headers({ "x-real-ip": "x".repeat(65) }))).toBeNull()
  })

  it("dérive une clé stable, propre au secret, sans l'IP en clair", async () => {
    const a = await demoEntryReader(SECRET, "192.0.2.7")
    expect(a).toMatch(DEMO_ENTRY_READER)
    expect(a).not.toContain("192")
    expect(await demoEntryReader(SECRET, "192.0.2.7")).toBe(a)
    expect(await demoEntryReader(SECRET, "192.0.2.8")).not.toBe(a)
    expect(await demoEntryReader(`${SECRET}x`, "192.0.2.7")).not.toBe(a)
    // Sans IP, rien n'est compté : pas de seau commun à tous les visiteurs sans adresse.
    expect(await demoEntryReader(SECRET, null)).toBeNull()
    expect(await demoEntryReader(SECRET, "")).toBeNull()
  })

  it("signe la demande sans jamais y mettre le secret", async () => {
    const request = await demoEntryRequest(SECRET, "192.0.2.7", NOW)
    expect(request).not.toBeNull()
    expect(request?.reader).toBe(await demoEntryReader(SECRET, "192.0.2.7"))
    expect(request?.at).toBe(NOW)
    expect(JSON.stringify(request)).not.toContain(SECRET)
    expect(await demoEntryRequest(SECRET, null, NOW)).toBeNull()
  })

  it("ne compte que les demandes signées, récentes et bien formées, sans jamais fermer la démo", async () => {
    const limit = vi.fn<DemoEntryLimit>(async () => ({ ok: false, retryAfter: 1_000 }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const request = (await demoEntryRequest(SECRET, "192.0.2.7", NOW))!
    const options = { secrets: [SECRET], limit, now: NOW }
    // Preuve d'un autre secret, preuve modifiée, autre visiteur, clé mal formée, heure hors fenêtre.
    const forged = [
      (await demoEntryRequest(`${SECRET}x`, "192.0.2.7", NOW))!,
      { ...request, proof: `${request.proof.slice(0, -1)}A` },
      { ...request, reader: (await demoEntryReader(SECRET, "192.0.2.8"))! },
      { ...request, reader: "192.0.2.7" },
      { ...request, at: NOW + 1 },
      (await demoEntryRequest(SECRET, "192.0.2.7", NOW - DEMO_ENTRY_PROOF_TTL_MS - 1))!,
      { ...request, at: Number.NaN },
    ]
    for (const args of forged) expect(await takeDemoEntry(args, options)).toEqual({ allowed: true })
    expect(limit).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(forged.length)
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET)
    warn.mockRestore()
    // Sans secret configuré : rien n'est compté.
    expect(await takeDemoEntry(request, { secrets: [undefined, ""], limit, now: NOW })).toEqual({ allowed: true })
    expect(limit).not.toHaveBeenCalled()
  })

  it("accepte une horloge décalée dans la fenêtre", async () => {
    const limit = vi.fn<DemoEntryLimit>(async () => ({ ok: true }))
    const early = (await demoEntryRequest(SECRET, "192.0.2.7", NOW - DEMO_ENTRY_PROOF_TTL_MS))!
    const late = (await demoEntryRequest(SECRET, "192.0.2.7", NOW + DEMO_ENTRY_PROOF_TTL_MS))!
    expect(await takeDemoEntry(early, { secrets: [SECRET], limit, now: NOW })).toEqual({ allowed: true })
    expect(await takeDemoEntry(late, { secrets: [SECRET], limit, now: NOW })).toEqual({ allowed: true })
    expect(limit).toHaveBeenCalledTimes(2)
  })

  it("compte pendant une rotation, que le front ait l'ancien ou le nouveau secret", async () => {
    const limit = vi.fn<DemoEntryLimit>(async () => ({ ok: true }))
    const options = { secrets: [`${SECRET}-neuf`, SECRET], limit, now: NOW }
    await takeDemoEntry((await demoEntryRequest(SECRET, "192.0.2.7", NOW))!, options)
    await takeDemoEntry((await demoEntryRequest(`${SECRET}-neuf`, "192.0.2.7", NOW))!, options)
    expect(limit).toHaveBeenCalledTimes(2)
  })

  it("prend un jeton par entrée et rend le délai du seau vide", async () => {
    const request = (await demoEntryRequest(SECRET, "192.0.2.7", NOW))!
    const ok = await takeDemoEntry(request, { secrets: [SECRET], limit: async () => ({ ok: true }), now: NOW })
    expect(ok).toEqual({ allowed: true })
    const full = await takeDemoEntry(request, {
      secrets: [SECRET],
      limit: async () => ({ ok: false, retryAfter: 1_500 }),
      now: NOW,
    })
    expect(full).toEqual({ allowed: false, retryAfterMs: 1_500 })
  })

  it("ne bloque jamais sur une panne", async () => {
    expect(await enterDemo(null)).toBeNull()
    expect(await enterDemo(async () => ({ allowed: true }))).toBeNull()
    expect(await enterDemo(async () => ({ allowed: false, retryAfterMs: 1_200 }))).toBe(2)
    expect(await enterDemo(async () => ({ allowed: false }))).toBe(60)
    expect(
      await enterDemo(async () => {
        throw new Error("Convex injoignable")
      }),
    ).toBeNull()
    expect(demoBusyMessage(5)).toContain("5 secondes")
    expect(demoBusyMessage(60)).toContain("une minute")
  })
})

describe("remise à zéro", () => {
  it("bat le heartbeat après une remise à zéro réussie", async () => {
    const fetch = vi.fn<Fetch>(async () => new Response(null))
    const report = vi.fn<(error: unknown) => Promise<void>>(async () => undefined)
    expect(await runDemoReset(async () => 6, { pingUrl: "https://status.example/ping/abc/", report, fetch })).toBe(6)
    expect(fetch).toHaveBeenCalledWith("https://status.example/ping/abc", expect.objectContaining({ method: "POST" }))
    expect(report).not.toHaveBeenCalled()
  })

  it("signale l'échec, bat `/fail` et relance l'erreur", async () => {
    const fetch = vi.fn<Fetch>(async () => new Response(null))
    const report = vi.fn<(error: unknown) => Promise<void>>(async () => undefined)
    const failure = new Error("remplissage cassé")
    await expect(
      runDemoReset(
        async () => {
          throw failure
        },
        { pingUrl: "https://status.example/ping/abc", report, fetch },
      ),
    ).rejects.toBe(failure)
    expect(report).toHaveBeenCalledWith(failure)
    expect(fetch).toHaveBeenCalledWith("https://status.example/ping/abc/fail", expect.anything())

    // Suivi des erreurs en panne : l'erreur d'origine remonte quand même, et `/fail` part.
    const broken = vi.fn<(error: unknown) => Promise<void>>(async () => {
      throw new Error("GlitchTip injoignable")
    })
    fetch.mockClear()
    await expect(
      runDemoReset(
        async () => {
          throw failure
        },
        { pingUrl: "https://status.example/ping/abc", report: broken, fetch },
      ),
    ).rejects.toBe(failure)
    expect(fetch).toHaveBeenCalledWith("https://status.example/ping/abc/fail", expect.anything())
  })

  it("ne bat rien sans adresse, et un Status injoignable ne fait pas échouer la démo", async () => {
    const report = vi.fn<(error: unknown) => Promise<void>>(async () => undefined)
    const silent = vi.fn<Fetch>(async () => new Response(null))
    await runDemoReset(async () => undefined, { pingUrl: undefined, report, fetch: silent })
    expect(silent).not.toHaveBeenCalled()
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const down = vi.fn<Fetch>(async () => {
      throw new Error("injoignable")
    })
    await expect(
      runDemoReset(async () => "ok", { pingUrl: "https://status.example/p", report, fetch: down }),
    ).resolves.toBe("ok")
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
