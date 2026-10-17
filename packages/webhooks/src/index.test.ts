import { describe, expect, test } from "vitest"

import {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  SECRET_PATTERN,
  TOLERANCE_SECONDS,
  generateSecret,
  isDelivered,
  isPrivateIp,
  isPublicUrl,
  parseWebhookUrl,
  resolvesPublicly,
  retryDelay,
  sign,
  signedHeaders,
  unmapIpv4,
  verify,
} from "./index"

const SECRET = `whsec_${btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 200 - i)))}`

/** Vecteur indépendant : HMAC-SHA256 recalculé avec les primitives de Web Crypto, hors du paquet. */
async function reference(secret: string, id: string, timestamp: number, body: string) {
  const raw = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  )
  return `v1,${btoa(String.fromCharCode(...mac))}`
}

describe("secret", () => {
  test("whsec_ + 32 octets aléatoires, différent à chaque tirage", () => {
    const a = generateSecret()
    expect(a).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    expect(SECRET_PATTERN.test(a)).toBe(true)
    expect(generateSecret()).not.toBe(a)
  })

  test("la forme refuse le texte quelconque", () => {
    for (const bad of ["", "whsec_", "whsec_court", "secret", "whsec_%%%%%%%%%%%%%%%%%%%%%%%%"])
      expect(SECRET_PATTERN.test(bad), bad).toBe(false)
  })
})

describe("signature", () => {
  const body = JSON.stringify({ type: "form.response.created", data: { id: "r1" } })

  test("sign donne le HMAC de id.timestamp.corps", async () => {
    expect(await sign(SECRET, "msg_1", 1_700_000_000, body)).toBe(await reference(SECRET, "msg_1", 1_700_000_000, body))
  })

  test("en-têtes de livraison", async () => {
    const headers = await signedHeaders(SECRET, "msg_1", 1_700_000_000, body)
    expect(headers).toMatchObject({
      "content-type": "application/json",
      "webhook-id": "msg_1",
      "webhook-timestamp": "1700000000",
    })
    expect(headers["webhook-signature"]).toMatch(/^v1,/)
  })

  test("un message signé est accepté, aller-retour avec generateSecret", async () => {
    const secret = generateSecret()
    const now = Date.now()
    const headers = await signedHeaders(secret, "msg_2", Math.floor(now / 1000), body)
    expect(
      await verify({
        secret,
        id: headers["webhook-id"],
        timestamp: headers["webhook-timestamp"],
        signature: headers["webhook-signature"],
        body,
        now,
      }),
    ).toBe("ok")
  })

  test("signature fausse, corps ou identifiant modifiés, autre secret : invalid", async () => {
    const now = 1_700_000_000_000
    const base = {
      secret: SECRET,
      id: "msg_1",
      timestamp: "1700000000",
      signature: await sign(SECRET, "msg_1", 1_700_000_000, body),
      body,
      now,
    }
    expect(await verify(base)).toBe("ok")
    expect(await verify({ ...base, body: body.replace("r1", "r2") })).toBe("invalid")
    expect(await verify({ ...base, id: "msg_2" })).toBe("invalid")
    expect(await verify({ ...base, timestamp: "1700000001" })).toBe("invalid")
    expect(await verify({ ...base, signature: "v1,AAAA" })).toBe("invalid")
    expect(await verify({ ...base, signature: "v2,xxx" })).toBe("invalid")
    expect(await verify({ ...base, secret: generateSecret() })).toBe("invalid")
    expect(await verify({ ...base, secret: "whsec_%%%" })).toBe("invalid")
  })

  test("en-têtes absents ou mal formés : invalid", async () => {
    const base = {
      secret: SECRET,
      id: "msg_1",
      timestamp: "1700000000",
      signature: "v1,AAAA",
      body,
      now: 1_700_000_000_000,
    }
    for (const patch of [
      { id: null },
      { id: "" },
      { timestamp: undefined },
      { timestamp: "abc" },
      { timestamp: "-5" },
      { signature: null },
    ])
      expect(await verify({ ...base, ...patch }), JSON.stringify(patch)).toBe("invalid")
  })

  test("plusieurs signatures : une bonne suffit (rotation de secret)", async () => {
    const good = await sign(SECRET, "msg_1", 1_700_000_000, body)
    const input = { secret: SECRET, id: "msg_1", timestamp: "1700000000", body, now: 1_700_000_000_000 }
    expect(await verify({ ...input, signature: `v1,AAAA ${good}` })).toBe("ok")
    expect(await verify({ ...input, signature: `${good} v1,AAAA` })).toBe("ok")
  })

  test("tolérance sur l'heure : 5 minutes, dans les deux sens", async () => {
    const at = 1_700_000_000
    const signature = await sign(SECRET, "msg_1", at, body)
    const input = { secret: SECRET, id: "msg_1", timestamp: String(at), signature, body }
    expect(TOLERANCE_SECONDS).toBe(300)
    expect(await verify({ ...input, now: (at + 299) * 1000 })).toBe("ok")
    expect(await verify({ ...input, now: (at - 299) * 1000 })).toBe("ok")
    expect(await verify({ ...input, now: (at + 301) * 1000 })).toBe("expired")
    expect(await verify({ ...input, now: (at - 301) * 1000 })).toBe("expired")
    expect(await verify({ ...input, now: (at + 3000) * 1000, toleranceSeconds: 3600 })).toBe("ok")
  })

  test("un message expiré n'est pas jugé sur sa signature", async () => {
    expect(
      await verify({
        secret: SECRET,
        id: "m",
        timestamp: "1700000000",
        signature: "v1,AAAA",
        body,
        now: 1_800_000_000_000,
      }),
    ).toBe("expired")
  })
})

describe("reprises", () => {
  test("huit essais, délais croissants, puis abandon", () => {
    expect(MAX_ATTEMPTS).toBe(8)
    expect(RETRY_DELAYS_MS).toEqual([5_000, 300_000, 1_800_000, 7_200_000, 18_000_000, 36_000_000, 36_000_000])
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelay)).toEqual([...RETRY_DELAYS_MS])
    expect(retryDelay(8)).toBeNull()
    expect(retryDelay(0)).toBeNull()
    expect(retryDelay(1.5)).toBeNull()
  })

  test("seul un 2xx est un succès", () => {
    expect(isDelivered(200)).toBe(true)
    expect(isDelivered(204)).toBe(true)
    for (const status of [0, 199, 301, 302, 400, 410, 500]) expect(isDelivered(status), String(status)).toBe(false)
  })
})

describe("garde SSRF", () => {
  test("adresses IP privées, locales et réservées refusées, publiques acceptées", () => {
    for (const ip of [
      "10.1.2.3",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "0:0:0:0:0:ffff:0a00:0001",
      "[::ffff:7f00:1]",
      "::7f00:1",
    ])
      expect(isPrivateIp(ip), ip).toBe(true)
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
      expect(isPrivateIp(ip), ip).toBe(false)
  })

  test("unmapIpv4 rend l'IPv4 d'une IPv6 mappée", () => {
    expect(unmapIpv4("::ffff:7f00:1")).toBe("127.0.0.1")
    expect(unmapIpv4("::ffff:10.0.0.1")).toBe("10.0.0.1")
    expect(unmapIpv4("2606:4700::1")).toBe("2606:4700::1")
  })

  test("adresse publique : http(s), port standard, nom de domaine, sans identifiants", () => {
    expect(isPublicUrl(new URL("https://exemple.ch/page"))).toBe(true)
    expect(isPublicUrl(new URL("http://exemple.ch"))).toBe(true)
    expect(isPublicUrl(new URL("http://exemple.ch"), { httpsOnly: true })).toBe(false)
    for (const raw of [
      "http://localhost",
      "http://127.0.0.1",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://10.0.0.1.nip.io",
      "http://intranet.corp",
      "https://exemple.ch:8443",
      "https://user:pass@exemple.ch",
      "ftp://exemple.ch",
      "http://0x7f000001",
      "http://localhost./",
      "http://metadata.google.internal./",
      "https://serveur.local",
    ])
      expect(isPublicUrl(new URL(raw)), raw).toBe(false)
  })

  test("adresse de webhook : https, port 443, public", () => {
    expect(parseWebhookUrl(" https://portail.exemple.ch/webhooks/mail#x ").href).toBe(
      "https://portail.exemple.ch/webhooks/mail",
    )
    expect(parseWebhookUrl("https://exemple.ch:443/x").port).toBe("")
    for (const bad of [
      "http://exemple.ch/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://exemple.ch:8443/x",
      "https://u:p@exemple.ch/x",
      "https://serveur.internal/x",
      "https://0x7f000001/x",
      "pas une url",
      `https://exemple.ch/${"a".repeat(600)}`,
    ])
      expect(() => parseWebhookUrl(bad), bad).toThrow(/adresse|https|URL/i)
  })

  test("résolution : un nom public qui pointe vers une adresse privée est refusé", async () => {
    const url = new URL("https://exemple.ch/x")
    expect(await resolvesPublicly(url, async () => ["93.184.216.34"])).toBe(true)
    expect(await resolvesPublicly(url, async () => ["93.184.216.34", "10.0.0.1"])).toBe(false)
    expect(await resolvesPublicly(url, async () => ["169.254.169.254"])).toBe(false)
    expect(await resolvesPublicly(url, async () => ["::ffff:7f00:1"])).toBe(false)
    expect(await resolvesPublicly(url, async () => [])).toBe(false)
    expect(await resolvesPublicly(url, async () => null)).toBe(false)
    const seen: string[] = []
    await resolvesPublicly(new URL("https://exemple.ch./x"), async (host) => (seen.push(host), ["93.184.216.34"]))
    expect(seen).toEqual(["exemple.ch"])
  })
})
