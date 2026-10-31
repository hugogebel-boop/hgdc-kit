import { describe, expect, it } from "vitest"

import {
  availability,
  creditsFromMicros,
  currentMonth,
  HAIKU_5_5,
  keyProvider,
  readKey,
  requestCost,
  requestMicros,
} from "./model.ts"
import { keyHint, openSecret, sealSecret } from "./secret.ts"

describe("clés", () => {
  it("reconnaît une clé Anthropic à son préfixe", () => {
    expect(keyProvider(`sk-ant-${"a".repeat(24)}`)).toBe("anthropic")
    expect(keyProvider(`sk-or-v1-${"b".repeat(24)}`)).toBeNull()
    expect(keyProvider("sk-proj-123")).toBeNull()
    expect(readKey(`  sk-ant-${"c".repeat(24)} `)).toBe(`sk-ant-${"c".repeat(24)}`)
    expect(readKey("")).toBeUndefined()
    expect(keyHint(`sk-ant-${"c".repeat(20)}wxyz`)).toBe("wxyz")
  })
})

describe("crédits", () => {
  it("Haiku 5.5 : 0,10 $ et 0,50 $ par million, palier long au-delà de 100 000 jetons", () => {
    const short = { input: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 }
    expect(requestCost(short, HAIKU_5_5.price)).toBeCloseTo(0.5) // 1 M d'entrée dépasse le palier
    const small = { input: 50_000, cacheWrite: 0, cacheRead: 40_000, output: 2_000 }
    expect(requestCost(small, HAIKU_5_5.price)).toBeCloseTo((50_000 * 0.1 + 40_000 * 0.01 + 2_000 * 0.5) / 1e6)
    // Cumul en micro-dollars entiers : un tour à 0,0004 $ compte 400, il n'est jamais arrondi à zéro.
    expect(requestMicros({ input: 1000, cacheWrite: 0, cacheRead: 0, output: 600 }, HAIKU_5_5.price)).toBe(400)
    expect(creditsFromMicros(1200)).toBe(0.1)
  })

  it("avec la clé de l'organisation, les crédits ne comptent pas", () => {
    expect(availability({ ownKey: true, platformKey: false, used: 999, limit: 300 })).toBe("ready")
    expect(availability({ ownKey: false, platformKey: false, used: 0, limit: 300 })).toBe("not_configured")
    expect(availability({ ownKey: false, platformKey: true, used: 300, limit: 300 })).toBe("exhausted")
    expect(availability({ ownKey: false, platformKey: true, used: 12.5, limit: 300 })).toBe("ready")
  })

  it("le mois est en UTC", () => {
    expect(currentMonth(Date.UTC(2026, 9, 31, 23, 30))).toBe("2026-10")
  })
})

describe("secret scellé", () => {
  const secret = "un-secret-de-deploiement-assez-long"

  it("s'ouvre avec le même secret et le même usage seulement", async () => {
    const sealed = await sealSecret("sk-ant-secret", { secret, context: "org_1" })
    expect(sealed.startsWith("v1.")).toBe(true)
    expect(sealed).not.toContain("sk-ant")
    expect(await openSecret(sealed, { secret, context: "org_1" })).toBe("sk-ant-secret")
    await expect(openSecret(sealed, { secret, context: "org_1", purpose: "turnstile" })).rejects.toThrow("illisible")
    await expect(openSecret(sealed, { secret: `${secret}-autre`, context: "org_1" })).rejects.toThrow("illisible")
    await expect(sealSecret("x", { secret: "court", context: "org_1" })).rejects.toThrow("trop court")
    // Copiée dans une autre organisation, la valeur ne s'ouvre pas.
    await expect(openSecret(sealed, { secret, context: "org_2" })).rejects.toThrow("illisible")
  })
})
