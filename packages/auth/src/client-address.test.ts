import { describe, expect, it } from "vitest"

import {
  CLIENT_ADDRESS_HEADER,
  CLIENT_ADDRESS_SIGNATURE_HEADER,
  restoreClientAddress,
  signClientAddress,
  visitorAddress,
} from "./client-address.ts"
import { createAuthProxy } from "./server.ts"

const SECRET = "secret-de-test-partage-entre-front-et-convex"
const CONVEX = "https://actions.exemple.ch"
const NOW = 1_800_000_000_000

/** La requête telle que Convex la reçoit : `x-forwarded-for` écrasé par le reverse proxy (adresse du front). */
async function throughProxy(
  visitor: Record<string, string>,
  options: { secret?: string; path?: string; method?: string } = {},
): Promise<Request> {
  let sent: Request | undefined
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers)
    headers.set("x-forwarded-for", "172.30.0.5")
    sent = new Request(url, { ...init, headers })
    return new Response(null, { status: 204 })
  }) as typeof fetch
  const proxy = createAuthProxy(CONVEX, fetchImpl, options.secret ? { addressSecret: options.secret } : {})
  await proxy(
    new Request(`https://account.hgdc.ch${options.path ?? "/api/auth/sign-in/email"}`, {
      method: options.method ?? "POST",
      headers: visitor,
      ...((options.method ?? "POST") === "POST" ? { body: "{}" } : {}),
    }),
  )
  return sent!
}

describe("visitorAddress", () => {
  it("prend x-real-ip, jamais x-forwarded-for", () => {
    expect(visitorAddress(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "203.0.113.7",
    )
    expect(visitorAddress(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1")
    // `x-forwarded-for` seul ne compte pas : le visiteur l'écrit chez un hébergeur qui ne l'écrase pas.
    expect(visitorAddress(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBeUndefined()
  })

  it("refuse ce qui n'est pas une adresse", () => {
    expect(visitorAddress(new Headers({ "x-real-ip": "1.2.3.4; evil" }))).toBeUndefined()
    expect(visitorAddress(new Headers({ "x-real-ip": "abc" }))).toBeUndefined()
    expect(visitorAddress(new Headers())).toBeUndefined()
  })
})

describe("adresse signée de bout en bout", () => {
  it("avec le secret des deux côtés, better-auth voit l'adresse du visiteur", async () => {
    const sent = await throughProxy({ "x-real-ip": "203.0.113.7" }, { secret: SECRET })
    const restored = await restoreClientAddress(sent, SECRET)
    expect(restored.headers.get("x-forwarded-for")).toBe("203.0.113.7")
    expect(restored.headers.get("x-real-ip")).toBe("203.0.113.7")
    expect(restored.headers.get(CLIENT_ADDRESS_HEADER)).toBeNull()
    expect(restored.headers.get(CLIENT_ADDRESS_SIGNATURE_HEADER)).toBeNull()
    expect(restored.method).toBe("POST")
    expect(await restored.text()).toBe("{}")
  })

  it("deux visiteurs gardent deux adresses distinctes", async () => {
    const a = await restoreClientAddress(await throughProxy({ "x-real-ip": "203.0.113.7" }, { secret: SECRET }), SECRET)
    const b = await restoreClientAddress(
      await throughProxy({ "x-real-ip": "198.51.100.9" }, { secret: SECRET }),
      SECRET,
    )
    expect(a.headers.get("x-forwarded-for")).not.toBe(b.headers.get("x-forwarded-for"))
  })

  it("sans secret côté proxy : rien n'est signé, Convex garde l'adresse du reverse proxy", async () => {
    const sent = await throughProxy({ "x-real-ip": "203.0.113.7" })
    expect(sent.headers.get(CLIENT_ADDRESS_HEADER)).toBeNull()
    expect((await restoreClientAddress(sent, SECRET)).headers.get("x-forwarded-for")).toBe("172.30.0.5")
  })

  it("sans secret côté Convex : l'adresse signée est retirée et ignorée", async () => {
    const sent = await throughProxy({ "x-real-ip": "203.0.113.7" }, { secret: SECRET })
    const restored = await restoreClientAddress(sent, undefined)
    expect(restored.headers.get("x-forwarded-for")).toBe("172.30.0.5")
    expect(restored.headers.get(CLIENT_ADDRESS_HEADER)).toBeNull()
  })
})

describe("restoreClientAddress refuse la falsification", () => {
  async function forged(headers: Record<string, string>, url = `${CONVEX}/api/auth/sign-in/email`) {
    return await restoreClientAddress(
      new Request(url, { method: "POST", headers: { "x-forwarded-for": "198.51.100.66", ...headers } }),
      SECRET,
      NOW,
    )
  }

  it("un client qui appelle Convex directement avec une adresse non signée garde la sienne", async () => {
    const restored = await forged({ [CLIENT_ADDRESS_HEADER]: "203.0.113.7" })
    expect(restored.headers.get("x-forwarded-for")).toBe("198.51.100.66")
    expect(restored.headers.get(CLIENT_ADDRESS_HEADER)).toBeNull()
  })

  it("une signature d'un autre secret, d'une autre adresse ou d'un autre chemin ne vaut rien", async () => {
    const headers = new Headers()
    await signClientAddress(headers, {
      address: "203.0.113.7",
      method: "POST",
      target: new URL(`${CONVEX}/api/auth/sign-in/email`),
      secret: SECRET,
      now: NOW,
    })
    const signature = headers.get(CLIENT_ADDRESS_SIGNATURE_HEADER)!
    // Bonne signature, rendue telle quelle : acceptée.
    expect(
      (
        await forged({ [CLIENT_ADDRESS_HEADER]: "203.0.113.7", [CLIENT_ADDRESS_SIGNATURE_HEADER]: signature })
      ).headers.get("x-forwarded-for"),
    ).toBe("203.0.113.7")
    // Autre adresse avec la même signature.
    expect(
      (
        await forged({ [CLIENT_ADDRESS_HEADER]: "203.0.113.8", [CLIENT_ADDRESS_SIGNATURE_HEADER]: signature })
      ).headers.get("x-forwarded-for"),
    ).toBe("198.51.100.66")
    // Autre chemin.
    expect(
      (
        await forged(
          { [CLIENT_ADDRESS_HEADER]: "203.0.113.7", [CLIENT_ADDRESS_SIGNATURE_HEADER]: signature },
          `${CONVEX}/api/auth/sign-up/email`,
        )
      ).headers.get("x-forwarded-for"),
    ).toBe("198.51.100.66")
    // Autre secret.
    const other = new Headers()
    await signClientAddress(other, {
      address: "203.0.113.7",
      method: "POST",
      target: new URL(`${CONVEX}/api/auth/sign-in/email`),
      secret: "un-autre-secret",
      now: NOW,
    })
    expect(
      (
        await forged({
          [CLIENT_ADDRESS_HEADER]: "203.0.113.7",
          [CLIENT_ADDRESS_SIGNATURE_HEADER]: other.get(CLIENT_ADDRESS_SIGNATURE_HEADER)!,
        })
      ).headers.get("x-forwarded-for"),
    ).toBe("198.51.100.66")
  })

  it("une signature de plus de 60 s ou malformée ne vaut rien", async () => {
    const headers = new Headers()
    await signClientAddress(headers, {
      address: "203.0.113.7",
      method: "POST",
      target: new URL(`${CONVEX}/api/auth/sign-in/email`),
      secret: SECRET,
      now: NOW - 61_000,
    })
    const stale = await forged({
      [CLIENT_ADDRESS_HEADER]: "203.0.113.7",
      [CLIENT_ADDRESS_SIGNATURE_HEADER]: headers.get(CLIENT_ADDRESS_SIGNATURE_HEADER)!,
    })
    expect(stale.headers.get("x-forwarded-for")).toBe("198.51.100.66")
    const malformed = await forged({
      [CLIENT_ADDRESS_HEADER]: "203.0.113.7",
      [CLIENT_ADDRESS_SIGNATURE_HEADER]: "1.zz",
    })
    expect(malformed.headers.get("x-forwarded-for")).toBe("198.51.100.66")
  })

  it("le proxy retire une adresse signée envoyée par le visiteur", async () => {
    const sent = await throughProxy({
      "x-real-ip": "203.0.113.7",
      [CLIENT_ADDRESS_HEADER]: "1.2.3.4",
      [CLIENT_ADDRESS_SIGNATURE_HEADER]: "1.ab",
    })
    expect(sent.headers.get(CLIENT_ADDRESS_HEADER)).toBeNull()
    expect(sent.headers.get(CLIENT_ADDRESS_SIGNATURE_HEADER)).toBeNull()
  })

  it("une requête sans en-tête de signature est rendue telle quelle", async () => {
    const plain = new Request(`${CONVEX}/api/auth/ok`)
    expect(await restoreClientAddress(plain, SECRET)).toBe(plain)
  })
})
