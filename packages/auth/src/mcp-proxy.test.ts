import { describe, expect, it } from "vitest"

import { restoreClientAddress } from "./client-address.ts"
import { convexPath, createMcpProxy, MAX_MCP_BODY_BYTES } from "./mcp-proxy.ts"

type Seen = { url: string; method: string; headers: Headers }

/** Un faux `fetch` qui note chaque appel vers Convex et rend `response()`. */
function recorder(response: () => Response = () => Response.json({ ok: true })) {
  const seen: Seen[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input instanceof Request ? input.url : input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
    })
    return response()
  }) as typeof globalThis.fetch
  return { seen, fetch }
}

describe("relais du serveur MCP", () => {
  it("retire la base sur une frontière de segment seulement", () => {
    expect(convexPath("/host/mcp", "/host")).toBe("/mcp")
    expect(convexPath("/hostile/mcp", "/host")).toBe("/hostile/mcp")
    expect(convexPath("/mcp", "")).toBe("/mcp")
  })

  it("relaie l'appel vers Convex avec la clé, sans les autres en-têtes ni les cookies", async () => {
    const { seen, fetch } = recorder(() => Response.json({ ok: true }, { headers: { "content-encoding": "gzip" } }))
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", { product: "host", basePath: "/host", fetch })
    const response = await proxy(
      new Request("https://app.hgdc.ch/host/mcp", {
        method: "POST",
        headers: { authorization: "Bearer hgdc_host_x", cookie: "session=1", "mcp-protocol-version": "2025-11-25" },
        body: "{}",
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-encoding")).toBeNull()
    expect(seen[0]!.url).toBe("https://actions.host.hgdc.ch/mcp")
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer hgdc_host_x")
    expect(seen[0]!.headers.get("mcp-protocol-version")).toBe("2025-11-25")
    expect(seen[0]!.headers.get("cookie")).toBeNull()
  })

  it("retire set-cookie de la réponse de Convex", async () => {
    const { fetch } = recorder(() =>
      Response.json({ ok: true }, { headers: { "set-cookie": "convex_session=1; Path=/; HttpOnly" } }),
    )
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", { product: "host", basePath: "/host", fetch })
    const response = await proxy(new Request("https://app.hgdc.ch/host/mcp", { method: "POST", body: "{}" }))
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(await response.json()).toEqual({ ok: true })
  })

  it("relaie le document RFC 9728 de la ressource, et lui seul sous .well-known", async () => {
    const { seen, fetch } = recorder(() => Response.json({ resource: "https://app.hgdc.ch/host/mcp" }))
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", { product: "host", basePath: "/host", fetch })
    const ok = await proxy(new Request("https://app.hgdc.ch/host/.well-known/oauth-protected-resource/host/mcp"))
    expect(ok.status).toBe(200)
    expect(seen.map((call) => call.url)).toEqual([
      "https://actions.host.hgdc.ch/.well-known/oauth-protected-resource/mcp",
    ])
    for (const path of [
      "/host/.well-known/oauth-protected-resource/mcp",
      "/host/.well-known/oauth-protected-resource/status/mcp",
    ])
      expect((await proxy(new Request(`https://app.hgdc.ch${path}`))).status).toBe(404)
    expect(seen).toHaveLength(1)
  })

  it("relaie Manager vers ses routes préfixées du Convex d'ID, jamais vers le MCP d'ID", async () => {
    const { seen, fetch } = recorder()
    const proxy = createMcpProxy("https://actions.account.hgdc.ch", {
      product: "manager",
      basePath: "/manager",
      convexPrefix: "/manager",
      fetch,
    })
    for (const path of ["/mcp", "/mcp/server-card", "/.well-known/oauth-protected-resource/manager/mcp"])
      expect((await proxy(new Request(`https://app.hgdc.ch/manager${path}`))).status).toBe(200)
    expect(seen.map((call) => call.url)).toEqual([
      "https://actions.account.hgdc.ch/manager/mcp",
      "https://actions.account.hgdc.ch/manager/mcp/server-card",
      "https://actions.account.hgdc.ch/manager/.well-known/oauth-protected-resource/mcp",
    ])
    expect(() => createMcpProxy("https://x.ch", { product: "manager", convexPrefix: "../api" })).toThrow(/convexPrefix/)
  })

  it("relaie les routes d'un produit servi à la racine (account)", async () => {
    const { seen, fetch } = recorder(() => Response.json({ resource: "https://account.hgdc.ch/mcp" }))
    const proxy = createMcpProxy("https://actions.account.hgdc.ch", { product: "account", fetch })
    expect((await proxy(new Request("https://account.hgdc.ch/mcp", { method: "POST", body: "{}" }))).status).toBe(200)
    expect((await proxy(new Request("https://account.hgdc.ch/mcp/server-card"))).status).toBe(200)
    expect((await proxy(new Request("https://account.hgdc.ch/.well-known/oauth-protected-resource/mcp"))).status).toBe(
      200,
    )
    expect(seen.map((call) => call.url)).toEqual([
      "https://actions.account.hgdc.ch/mcp",
      "https://actions.account.hgdc.ch/mcp/server-card",
      "https://actions.account.hgdc.ch/.well-known/oauth-protected-resource/mcp",
    ])
    expect(
      (await proxy(new Request("https://account.hgdc.ch/.well-known/oauth-protected-resource/host/mcp"))).status,
    ).toBe(404)
  })

  it("refuse une route inconnue de Convex, sans rien relayer", async () => {
    const { seen, fetch } = recorder()
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", { product: "host", basePath: "/host", fetch })
    expect((await proxy(new Request("https://app.hgdc.ch/host/edge/v1/resolve"))).status).toBe(404)
    expect((await proxy(new Request("https://app.hgdc.ch/host/mcp/autre"))).status).toBe(404)
    expect(seen).toHaveLength(0)
  })

  it("refuse un corps trop gros sans l'envoyer à Convex", async () => {
    const { seen, fetch } = recorder()
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", { product: "host", basePath: "/host", fetch })
    const big = new Request("https://app.hgdc.ch/host/mcp", {
      method: "POST",
      headers: { "content-length": String(MAX_MCP_BODY_BYTES + 1) },
      body: "x",
    })
    expect((await proxy(big)).status).toBe(413)
    expect(seen).toHaveLength(0)
  })

  it("répond 502 au format JSON-RPC quand Convex ne répond pas", async () => {
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", {
      product: "host",
      basePath: "/host",
      fetch: (async () => {
        throw new TypeError("fetch failed")
      }) as unknown as typeof globalThis.fetch,
    })
    const response = await proxy(new Request("https://app.hgdc.ch/host/mcp", { method: "POST", body: "{}" }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Le serveur MCP ne répond pas. Réessaie dans un instant." },
    })
  })

  it("signe l'adresse du visiteur avec le secret, jamais celle envoyée par le client", async () => {
    const plain = recorder()
    const signed = recorder()
    const request = () =>
      new Request("https://app.hgdc.ch/host/mcp", {
        method: "POST",
        headers: {
          "x-real-ip": "203.0.113.7",
          "x-hgdc-client-address": "6.6.6.6",
          "x-hgdc-client-address-signature": "1.forge",
          "x-forwarded-for": "6.6.6.6",
        },
        body: "{}",
      })
    await createMcpProxy("https://actions.host.hgdc.ch", {
      product: "host",
      basePath: "/host",
      addressSecret: () => "secret",
      fetch: signed.fetch,
    })(request())
    await createMcpProxy("https://actions.host.hgdc.ch", {
      product: "host",
      basePath: "/host",
      addressSecret: () => undefined,
      fetch: plain.fetch,
    })(request())
    const [withSecret] = signed.seen
    const [withoutSecret] = plain.seen
    expect(withSecret!.headers.get("x-hgdc-client-address")).toBe("203.0.113.7")
    expect(withSecret!.headers.get("x-hgdc-client-address-signature")).toMatch(/^\d+\.[0-9a-f]{64}$/)
    expect(withSecret!.headers.has("x-forwarded-for")).toBe(false)
    expect(withoutSecret!.headers.has("x-hgdc-client-address")).toBe(false)
    expect(withoutSecret!.headers.has("x-hgdc-client-address-signature")).toBe(false)
  })

  it("la signature est celle que Convex vérifie (restoreClientAddress)", async () => {
    const { seen, fetch } = recorder()
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", {
      product: "host",
      basePath: "/host",
      addressSecret: () => "secret",
      fetch,
    })
    await proxy(
      new Request("https://app.hgdc.ch/host/mcp", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.7" },
        body: "{}",
      }),
    )
    const call = seen[0]!
    const restored = await restoreClientAddress(
      new Request(call.url, { method: call.method, headers: call.headers }),
      "secret",
    )
    expect(restored.headers.get("x-forwarded-for")).toBe("203.0.113.7")
  })

  it("n'envoie aucune adresse signée sans adresse du visiteur", async () => {
    const { seen, fetch } = recorder()
    const proxy = createMcpProxy("https://actions.host.hgdc.ch", {
      product: "host",
      basePath: "/host",
      addressSecret: () => "secret",
      fetch,
    })
    await proxy(new Request("https://app.hgdc.ch/host/mcp", { method: "POST", body: "{}" }))
    expect(seen[0]!.headers.has("x-hgdc-client-address")).toBe(false)
    expect(seen[0]!.headers.has("x-hgdc-client-address-signature")).toBe(false)
  })
})
