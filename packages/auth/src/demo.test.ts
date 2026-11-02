import { ConvexError } from "convex/values"
import { describe, expect, it, vi } from "vitest"

import {
  DEMO_ACCESS,
  DEMO_ENTRY_READER,
  DEMO_ORGANIZATION_ID,
  DEMO_READ_ONLY,
  demoBusyMessage,
  demoEntryAddressKey,
  demoEntryReader,
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
    expect(demoEntryAddressKey(null)).toBe("inconnue")
  })

  it("dérive une clé stable, propre au secret, sans l'IP en clair", async () => {
    const a = await demoEntryReader(SECRET, "192.0.2.7")
    expect(a).toMatch(DEMO_ENTRY_READER)
    expect(a).not.toContain("192")
    expect(await demoEntryReader(SECRET, "192.0.2.7")).toBe(a)
    expect(await demoEntryReader(SECRET, "192.0.2.8")).not.toBe(a)
    expect(await demoEntryReader(`${SECRET}x`, "192.0.2.7")).not.toBe(a)
  })

  it("refuse sans le bon secret ou avec une clé mal formée, sans toucher au seau", async () => {
    const limit = vi.fn<DemoEntryLimit>(async () => ({ ok: true }))
    const reader = await demoEntryReader(SECRET, "192.0.2.7")
    expect(await takeDemoEntry({ relay: "faux", reader }, { secret: SECRET, limit })).toEqual({ allowed: false })
    expect(await takeDemoEntry({ relay: SECRET, reader: "192.0.2.7" }, { secret: SECRET, limit })).toEqual({
      allowed: false,
    })
    expect(await takeDemoEntry({ relay: "", reader }, { secret: undefined, limit })).toEqual({ allowed: false })
    expect(await takeDemoEntry({ relay: "court", reader }, { secret: "court", limit })).toEqual({ allowed: false })
    expect(limit).not.toHaveBeenCalled()
  })

  it("prend un jeton par entrée et rend le délai du seau vide", async () => {
    const reader = await demoEntryReader(SECRET, "192.0.2.7")
    const ok = await takeDemoEntry({ relay: SECRET, reader }, { secret: SECRET, limit: async () => ({ ok: true }) })
    expect(ok).toEqual({ allowed: true })
    const full = await takeDemoEntry(
      { relay: SECRET, reader },
      { secret: SECRET, limit: async () => ({ ok: false, retryAfter: 1_500 }) },
    )
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
