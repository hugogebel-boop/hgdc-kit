import { describe, expect, it } from "vitest"

import { availability, creditsFromCost, currentMonth, HAIKU_5_5, keyProvider, readKey, requestCost } from "./model.ts"
import { keyHint, openSecret, sealSecret } from "./secret.ts"

describe("clés", () => {
  it("reconnaît Anthropic et OpenRouter à leur préfixe", () => {
    expect(keyProvider(`sk-ant-${"a".repeat(24)}`)).toBe("anthropic")
    expect(keyProvider(`sk-or-v1-${"b".repeat(24)}`)).toBe("openrouter")
    expect(keyProvider("sk-proj-123")).toBeNull()
    expect(readKey(`  sk-or-v1-${"c".repeat(24)} `)).toBe(`sk-or-v1-${"c".repeat(24)}`)
    expect(readKey("")).toBeUndefined()
    expect(keyHint(`sk-or-v1-${"c".repeat(20)}wxyz`)).toBe("wxyz")
  })
})

describe("crédits", () => {
  it("Haiku 5.5 : 0,10 $ et 0,50 $ par million, palier long au-delà de 100 000 jetons", () => {
    const short = { input: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 }
    expect(requestCost(short, HAIKU_5_5.price)).toBeCloseTo(0.5) // 1 M d'entrée dépasse le palier
    const small = { input: 50_000, cacheWrite: 0, cacheRead: 40_000, output: 2_000 }
    expect(requestCost(small, HAIKU_5_5.price)).toBeCloseTo((50_000 * 0.1 + 40_000 * 0.01 + 2_000 * 0.5) / 1e6)
    expect(creditsFromCost(0.0123)).toBe(1.2)
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
    const sealed = await sealSecret("sk-or-v1-secret", { secret })
    expect(sealed.startsWith("v1.")).toBe(true)
    expect(sealed).not.toContain("sk-or")
    expect(await openSecret(sealed, { secret })).toBe("sk-or-v1-secret")
    await expect(openSecret(sealed, { secret, purpose: "turnstile" })).rejects.toThrow("illisible")
    await expect(openSecret(sealed, { secret: `${secret}-autre` })).rejects.toThrow("illisible")
    await expect(sealSecret("x", { secret: "court" })).rejects.toThrow("trop court")
  })
})
