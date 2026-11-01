import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { describe, expect, test } from "vitest"

import { SafeFetchError, safeFetch, sendPinned } from "./safe-fetch"
import type { Resolve, Send } from "./safe-fetch"

const publicIp: Resolve = async () => [{ address: "93.184.215.14", family: 4 }]

/** Faux saut : rend la réponse choisie pour chaque URL, et note l'adresse visée. */
function fakeSend(routes: Record<string, { status: number; location?: string }>) {
  const calls: { url: string; address: string; method: string }[] = []
  const send: Send = async (url, target, init) => {
    calls.push({ url: url.toString(), address: target.address, method: init.method })
    const route = routes[url.toString()] ?? { status: 200 }
    return {
      status: route.status,
      headers: route.location ? { location: route.location } : {},
      body: new TextEncoder().encode("ok"),
    }
  }
  return { send, calls }
}

async function code(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e instanceof SafeFetchError ? e.code : "autre"
  }
  return "aucune"
}

describe("safeFetch", () => {
  test("refuse une IP, un port particulier, des identifiants ou un nom interne, sans résoudre", async () => {
    const resolve: Resolve = async () => {
      throw new Error("ne doit pas résoudre")
    }
    for (const url of [
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "https://site.ch:8443/",
      "https://user:pw@site.ch/",
      "http://localhost/",
      "https://db.internal/",
      "file:///etc/passwd",
    ]) {
      expect(await code(safeFetch(url, {}, { resolve }))).toBe("unsafe_url")
    }
  })

  test("refuse un nom public qui mène à une adresse privée, de métadonnées ou ULA", async () => {
    for (const address of [
      "10.0.0.5",
      "127.0.0.1",
      "169.254.169.254",
      "100.100.1.1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      const resolve: Resolve = async () => [
        { address: "93.184.215.14", family: 4 },
        { address, family: address.includes(":") ? 6 : 4 },
      ]
      expect(await code(safeFetch("https://piege.example.ch/", {}, { resolve, send: fakeSend({}).send }))).toBe(
        "private_address",
      )
    }
  })

  test("se connecte à l'adresse vérifiée", async () => {
    const { send, calls } = fakeSend({})
    const res = await safeFetch("https://site.ch/a", {}, { resolve: publicIp, send })
    expect(res.status).toBe(200)
    expect(calls).toEqual([{ url: "https://site.ch/a", address: "93.184.215.14", method: "GET" }])
  })

  test("ne suit pas une redirection par défaut", async () => {
    const { send, calls } = fakeSend({ "https://site.ch/": { status: 302, location: "https://autre.ch/" } })
    const res = await safeFetch("https://site.ch/", {}, { resolve: publicIp, send })
    expect(res.status).toBe(302)
    expect(calls).toHaveLength(1)
  })

  test("revérifie chaque redirection suivie", async () => {
    const resolve: Resolve = async (host) =>
      host === "interne.example.ch" ? [{ address: "10.1.2.3", family: 4 }] : [{ address: "93.184.215.14", family: 4 }]
    const routes = {
      "https://site.ch/": { status: 301, location: "/suite" },
      "https://site.ch/suite": { status: 302, location: "https://interne.example.ch/admin" },
    }
    expect(
      await code(safeFetch("https://site.ch/", { maxRedirects: 5 }, { resolve, send: fakeSend(routes).send })),
    ).toBe("private_address")
    const toIp = { "https://site.ch/": { status: 302, location: "http://169.254.169.254/" } }
    expect(await code(safeFetch("https://site.ch/", { maxRedirects: 5 }, { resolve, send: fakeSend(toIp).send }))).toBe(
      "unsafe_url",
    )
  })

  test("borne le nombre de redirections et passe en GET après un POST redirigé", async () => {
    const loop = { "https://site.ch/": { status: 302, location: "https://site.ch/" } }
    expect(
      await code(safeFetch("https://site.ch/", { maxRedirects: 3 }, { resolve: publicIp, send: fakeSend(loop).send })),
    ).toBe("too_many_redirects")
    const { send, calls } = fakeSend({ "https://site.ch/form": { status: 302, location: "/merci" } })
    await safeFetch("https://site.ch/form", { method: "POST", body: "x", maxRedirects: 1 }, { resolve: publicIp, send })
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"])
  })

  test("un nom qui ne se résout pas est refusé", async () => {
    expect(await code(safeFetch("https://rien.example.ch/", {}, { resolve: async () => [] }))).toBe("dns")
  })
})

describe("sendPinned", () => {
  test("vise l'adresse donnée sans résoudre le nom, garde le Host et borne la taille", async () => {
    const server = createServer((req, res) => {
      res.end(req.url === "/gros" ? "x".repeat(5000) : `host=${req.headers.host}`)
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const { port } = server.address() as AddressInfo
    const signal = AbortSignal.timeout(5000)
    try {
      // Ce nom n'existe pas : seule l'adresse épinglée permet d'arriver au serveur.
      const url = new URL(`http://nom-qui-n-existe-pas.invalid:${port}/`)
      const res = await sendPinned(
        url,
        { address: "127.0.0.1", family: 4 },
        { method: "GET", headers: {}, maxBytes: 1000, signal },
      )
      expect(new TextDecoder().decode(res.body)).toBe(`host=nom-qui-n-existe-pas.invalid:${port}`)
      const big = sendPinned(
        new URL(`http://x.invalid:${port}/gros`),
        { address: "127.0.0.1", family: 4 },
        {
          method: "GET",
          headers: {},
          maxBytes: 1000,
          signal,
        },
      )
      expect(await code(big)).toBe("too_large")
    } finally {
      server.close()
    }
  })
})
