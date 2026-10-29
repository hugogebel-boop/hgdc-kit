import { describe, expect, it } from "vitest"
import { BASE62, crc32, randomBase62, toBase62 } from "./encoding.ts"
import {
  KEY_PATTERN,
  classifyKey,
  createKey,
  generateKey,
  hasScope,
  hashKey,
  isLegacyKey,
  isValidKey,
  keyPreview,
  keyStatus,
  parseKey,
  parseScopes,
  productScopes,
  shouldTouchLastUsed,
} from "./keys.ts"

describe("format des clés", () => {
  it("hgdc_<produit>_ suivi de 38 caractères base62", () => {
    const key = generateKey("mail")
    expect(key).toMatch(/^hgdc_mail_[0-9A-Za-z]{38}$/)
    expect(KEY_PATTERN.test(key)).toBe(true)
    expect(isValidKey(key)).toBe(true)
    expect(isValidKey(key, "mail")).toBe(true)
    expect(isValidKey(key, "host")).toBe(false)
  })

  it("deux clés ne se ressemblent pas", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateKey("host")))
    expect(keys.size).toBe(200)
  })

  it("refuse un produit mal formé", () => {
    for (const product of ["", "M", "mail_x", "Mail", "1mail", "a".repeat(21)]) {
      expect(() => generateKey(product)).toThrow(/Produit de clé invalide/)
    }
  })

  it("la somme de contrôle détecte une faute de frappe et un changement de produit", () => {
    const key = generateKey("mail")
    const body = key.slice("hgdc_mail_".length)
    const typo = `hgdc_mail_${body[0] === "a" ? "b" : "a"}${body.slice(1)}`
    expect(isValidKey(typo)).toBe(false)
    expect(parseKey(`hgdc_host_${body}`)).toBeNull()
    expect(parseKey(`${key}x`)).toBeNull()
  })

  it("parseKey rend les parties", () => {
    const parsed = parseKey(generateKey("docs"))
    expect(parsed?.product).toBe("docs")
    expect(parsed?.random).toHaveLength(32)
    expect(parsed?.checksum).toHaveLength(6)
  })

  it("somme de contrôle : CRC-32 connu", () => {
    expect(crc32("123456789")).toBe(0xcbf43926)
    expect(toBase62(0, 6)).toBe("000000")
    expect(toBase62(61, 2)).toBe("0z")
    expect(toBase62(0xffffffff, 6)).toHaveLength(6)
  })

  it("aperçu sans la clé", () => {
    const key = generateKey("mail")
    const preview = keyPreview(key)
    expect(preview).toMatch(/^hgdc_mail_…[0-9A-Za-z]{4}$/)
    expect(key.endsWith(preview.slice(-4))).toBe(true)
    expect(keyPreview("am_abcdefghijklmnop")).toBe("am_ab…mnop")
  })

  it("empreinte SHA-256 en hexadécimal, stable", async () => {
    expect(await hashKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    const created = await createKey("host")
    expect(created.hash).toBe(await hashKey(created.key))
    expect(created.preview).toBe(keyPreview(created.key))
  })
})

describe("tirage base62 par rejet", () => {
  it("rejette les octets 248 à 255", () => {
    // 248…255 sont jetés ; 0, 61, 62 et 247 donnent 0, z, 0 et z.
    let call = 0
    const random = (bytes: Uint8Array) => {
      const source = call++ === 0 ? [248, 255, 0, 61, 62, 247] : [1]
      bytes.fill(0)
      bytes.set(source.slice(0, bytes.length))
      return bytes
    }
    expect(randomBase62(4, random)).toBe("0z0z")
  })

  it("sans biais : chaque caractère près de 1/62", () => {
    const counts = new Map<string, number>()
    const sample = randomBase62(62 * 2000)
    for (const c of sample) counts.set(c, (counts.get(c) ?? 0) + 1)
    expect(counts.size).toBe(62)
    // Khi-deux à 61 degrés de liberté : au-delà de 110, p < 0,0001.
    const expected = sample.length / 62
    const chi2 = BASE62.split("").reduce((sum, c) => sum + ((counts.get(c) ?? 0) - expected) ** 2 / expected, 0)
    expect(chi2).toBeLessThan(110)
  })

  it("un tirage modulo sans rejet favoriserait les 8 premiers caractères", () => {
    // Témoin : 256 = 4 × 62 + 8, les caractères 0…7 sortiraient 5 fois sur 256 au lieu de 4.
    const biased = Array.from({ length: 256 }, (_, b) => BASE62[b % 62])
    expect(biased.filter((c) => c === "0")).toHaveLength(5)
    expect(biased.filter((c) => c === "z")).toHaveLength(4)
  })
})

describe("anciennes clés", () => {
  it("accepte les préfixes déclarés, assez longs", () => {
    expect(isLegacyKey("am_0123456789abcdef", ["am_"])).toBe(true)
    expect(isLegacyKey("am_short", ["am_"])).toBe(false)
    expect(isLegacyKey("pmcp_0123456789abcdef", ["am_"])).toBe(false)
    expect(isLegacyKey("anything_0123456789abcdef", [""])).toBe(false)
  })

  it("classe une clé reçue", () => {
    expect(classifyKey(generateKey("mail"), { product: "mail", legacyPrefixes: ["am_"] })).toBe("current")
    expect(classifyKey(generateKey("host"), { product: "mail", legacyPrefixes: ["am_"] })).toBe("invalid")
    expect(classifyKey("am_0123456789abcdef", { product: "mail", legacyPrefixes: ["am_"] })).toBe("legacy")
    expect(classifyKey("am_0123456789abcdef", { product: "mail" })).toBe("invalid")
  })
})

describe("scopes", () => {
  it("lit une chaîne OAuth ou un tableau, ignore le mal formé", () => {
    expect(parseScopes("mail:write  mail:read openid MAIL:read mail:")).toEqual(["mail:read", "mail:write"])
    expect(parseScopes(["host:read", "host:read", "x"])).toEqual(["host:read"])
    expect(parseScopes(null)).toEqual([])
  })

  it("write donne read, admin donne write et read, rien d'autre", () => {
    expect(hasScope(["mail:write"], "mail:read")).toBe(true)
    expect(hasScope(["mail:admin"], "mail:write")).toBe(true)
    expect(hasScope(["mail:read"], "mail:write")).toBe(false)
    expect(hasScope(["host:write"], "mail:read")).toBe(false)
    expect(hasScope(["mail:read"], "mail:read")).toBe(true)
    expect(hasScope(["mail:read"], "bad scope")).toBe(false)
  })

  it("scopes d'un produit", () => {
    expect(productScopes("status")).toEqual(["status:read", "status:write"])
  })
})

describe("cycle de vie", () => {
  const now = 1_000_000
  it("statut d'une clé", () => {
    expect(keyStatus({}, now)).toBe("active")
    expect(keyStatus({ expiresAt: now }, now)).toBe("expired")
    expect(keyStatus({ expiresAt: now + 1, revokedAt: 5 }, now)).toBe("revoked")
    expect(keyStatus({ expiresAt: null, revokedAt: null }, now)).toBe("active")
  })

  it("lastUsedAt réécrit une fois par minute au plus", () => {
    expect(shouldTouchLastUsed(undefined, now)).toBe(true)
    expect(shouldTouchLastUsed(now - 59_999, now)).toBe(false)
    expect(shouldTouchLastUsed(now - 60_000, now)).toBe(true)
    expect(shouldTouchLastUsed(now - 10, now, 5)).toBe(true)
  })
})
