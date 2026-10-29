import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { defineTools } from "../../assistant/src/tools.ts"
import { unauthorized } from "./bearer.ts"
import {
  ToolError,
  aiCatalog,
  annotationsFor,
  createMcpHandler,
  decodeHeaderValue,
  mcpTools,
  serverCard,
  serverCardResponse,
  type McpHandlerOptions,
} from "./mcp.ts"

const TOOLS = defineTools({
  list_domains: {
    kind: "read",
    label: "Lecture des domaines",
    description: "Liste les domaines de l'organisation.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    output: z.object({ domains: z.array(z.string()) }),
  },
  update_domain: {
    kind: "write",
    label: "Réglage d'un domaine",
    description: "Change le réglage d'un domaine.",
    input: z.object({ domain: z.string(), tracking: z.boolean() }),
    annotations: { idempotentHint: true },
  },
  send_email: {
    kind: "confirm",
    label: "Envoi d'un e-mail",
    title: "Envoyer un e-mail",
    description: "Envoie un e-mail.",
    input: z.object({ to: z.email() }),
  },
})

type Ctx = { user: string; scopes: string[] }
const URL_MCP = "https://app.hgdc.ch/mail/mcp"

function setup(overrides: Partial<McpHandlerOptions<Ctx>> = {}) {
  const execute = vi.fn<(call: { name: string; input: Record<string, unknown> }) => Promise<unknown>>(
    async ({ name, input }: { name: string; input: Record<string, unknown> }) => {
      if (name === "list_domains")
        return { domains: ["a.ch", "b.ch"].slice(0, (input.limit as number | undefined) ?? 2) }
      if (name === "update_domain") {
        if (input.domain === "x.ch") throw new ToolError("Domaine inconnu : x.ch.")
        if (input.domain === "boom.ch") throw new Error("secret interne")
        return "ok"
      }
      return { sent: true }
    },
  )
  const onError = vi.fn<(error: unknown, info: { method: string; tool?: string }) => void>()
  const handler = createMcpHandler<Ctx>({
    server: { name: "mail", title: "Mail", version: "1.0.0" },
    instructions: "Commence par list_domains.",
    tools: TOOLS,
    authenticate: (request) =>
      request.headers.get("authorization") === "Bearer good"
        ? { user: "u1", scopes: ["mail:read"] }
        : unauthorized({ resourceMetadata: "https://app.hgdc.ch/.well-known/oauth-protected-resource/mail/mcp" }),
    execute,
    canUse: (ctx, _name, tool) => tool.kind === "read" || ctx.scopes.includes("mail:write"),
    onError,
    ...overrides,
  })
  return { handler, execute, onError }
}

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
}

function modern(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request(URL_MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer good",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(typeof params.name === "string" && { "mcp-name": params.name }),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }),
  })
}

function legacy(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL_MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer good",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function rpc(response: Response) {
  return (await response.json()) as {
    id: unknown
    result?: Record<string, unknown>
    error?: { code: number; message: string; data?: Record<string, unknown> }
  }
}

describe("outils dérivés d'un ToolSet", () => {
  it("annotations déduites de la classe, surcharge et titre", () => {
    const tools = mcpTools(TOOLS)
    expect(tools.map((t) => t.name)).toEqual(["list_domains", "update_domain", "send_email"])
    expect(tools[0]!.annotations).toEqual({ title: "Lecture des domaines", ...annotationsFor("read") })
    expect(tools[1]!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true })
    expect(tools[2]!.title).toBe("Envoyer un e-mail")
    expect(tools[2]!.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true })
  })

  it("classe send : ouverte sur l'extérieur, ni lecture seule ni rejouable", () => {
    expect(annotationsFor("send")).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    })
    const [tool] = mcpTools({
      notify: { kind: "send", label: "Envoi", description: "Envoie.", input: z.object({}), private: true },
    } as Parameters<typeof mcpTools>[0])
    expect(tool!.annotations.openWorldHint).toBe(true)
  })

  it("inputSchema en JSON Schema, outputSchema quand fourni", () => {
    const [list, update] = mcpTools(TOOLS)
    expect(list!.inputSchema.type).toBe("object")
    expect(list!.inputSchema).not.toHaveProperty("$schema")
    expect(list!.outputSchema).toMatchObject({ type: "object", required: ["domains"] })
    expect(update!.outputSchema).toBeUndefined()
    expect(update!.inputSchema.required).toEqual(["domain", "tracking"])
  })
})

describe("transport", () => {
  it("GET et DELETE : 405", async () => {
    const { handler } = setup()
    for (const method of ["GET", "DELETE"]) {
      const response = await handler(new Request(URL_MCP, { method }))
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("POST")
    }
  })

  it("Origin inconnue : 403 ; même origine ou origine listée : acceptée", async () => {
    const { handler } = setup({ allowedOrigins: ["https://inspector.test"] })
    expect((await handler(modern("ping", {}, { origin: "https://evil.test" }))).status).toBe(403)
    expect((await handler(modern("ping", {}, { origin: "https://app.hgdc.ch" }))).status).toBe(200)
    expect((await handler(modern("ping", {}, { origin: "https://inspector.test" }))).status).toBe(200)
  })

  it("Content-Type, Accept et taille", async () => {
    const { handler } = setup({ maxBodyBytes: 200 })
    expect((await handler(modern("ping", {}, { "content-type": "text/plain" }))).status).toBe(415)
    expect((await handler(modern("ping", {}, { accept: "text/event-stream" }))).status).toBe(406)
    const big = modern("tools/call", { name: "list_domains", arguments: { pad: "x".repeat(500) } })
    expect((await handler(big)).status).toBe(413)
  })

  it("JSON illisible : -32700 ; lot : refusé", async () => {
    const { handler } = setup()
    const bad = await handler(legacy("{oops"))
    expect(bad.status).toBe(400)
    expect((await rpc(bad)).error?.code).toBe(-32700)
    const batch = await handler(
      legacy([{ jsonrpc: "2.0", id: 1, method: "ping" }], { "mcp-protocol-version": "2025-11-25" }),
    )
    expect(batch.status).toBe(400)
    expect((await rpc(batch)).error?.code).toBe(-32600)
  })

  it("notification et réponse du client : 202 sans corps, sans authentification", async () => {
    const { handler } = setup()
    const note = await handler(legacy({ jsonrpc: "2.0", method: "notifications/initialized" }, { authorization: "" }))
    expect(note.status).toBe(202)
    expect(await note.text()).toBe("")
    expect((await handler(legacy({ jsonrpc: "2.0", id: 9, result: {} }))).status).toBe(202)
  })

  it("requête mal formée : -32600", async () => {
    const { handler } = setup()
    for (const body of [
      { id: 1, method: "ping" },
      { jsonrpc: "2.0", id: null, method: "ping" },
      { jsonrpc: "2.0", id: 1, method: 3 },
    ]) {
      const response = await handler(legacy(body, { "mcp-protocol-version": "2025-11-25" }))
      expect(response.status).toBe(400)
      expect((await rpc(response)).error?.code).toBe(-32600)
    }
  })

  it("sans jeton : le 401 du produit, avec resource_metadata", async () => {
    const { handler, execute } = setup()
    const response = await handler(modern("tools/list", {}, { authorization: "Bearer bad" }))
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=")
    expect(execute).not.toHaveBeenCalled()
  })

  it("en-têtes base64 décodés", () => {
    expect(decodeHeaderValue("plain")).toBe("plain")
    expect(decodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?=")).toBe("Hello, 世界")
    expect(decodeHeaderValue("=?base64?/w==?=")).toBeNull()
  })
})

describe("révision 2026-07-28 (sans état)", () => {
  it("server/discover : versions, capacités, identité", async () => {
    const { handler } = setup()
    const { result } = await rpc(await handler(modern("server/discover")))
    expect(result).toMatchObject({
      resultType: "complete",
      supportedVersions: ["2026-07-28", "2025-11-25", "2025-06-18"],
      capabilities: { tools: {} },
      instructions: "Commence par list_domains.",
      cacheScope: "public",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "mail", title: "Mail", version: "1.0.0" } },
    })
  })

  it("tools/list filtré par les droits du jeton, cache privé", async () => {
    const { handler } = setup()
    const { result } = await rpc(await handler(modern("tools/list")))
    expect(((result?.tools ?? []) as { name: string }[]).map((t) => t.name)).toEqual(["list_domains"])
    expect(result).toMatchObject({ resultType: "complete", cacheScope: "private" })
    expect(typeof result?.ttlMs).toBe("number")
  })

  it("tools/call : structuredContent vérifié et texte JSON", async () => {
    const { handler } = setup()
    const { result } = await rpc(await handler(modern("tools/call", { name: "list_domains", arguments: { limit: 1 } })))
    expect(result).toMatchObject({
      resultType: "complete",
      structuredContent: { domains: ["a.ch"] },
      content: [{ type: "text", text: '{"domains":["a.ch"]}' }],
    })
    expect(result?.isError).toBeUndefined()
  })

  it("outil inconnu ou masqué : -32602", async () => {
    const { handler, execute } = setup()
    for (const name of ["nope", "update_domain", "__proto__"]) {
      const { error } = await rpc(await handler(modern("tools/call", { name, arguments: {} })))
      expect(error?.code).toBe(-32602)
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it("arguments qui ne sont pas un objet : -32602 ; arguments refusés par le schéma : isError", async () => {
    const { handler, execute } = setup()
    const notObject = await rpc(await handler(modern("tools/call", { name: "list_domains", arguments: [1] })))
    expect(notObject.error?.code).toBe(-32602)
    const invalid = await rpc(
      await handler(modern("tools/call", { name: "list_domains", arguments: { limit: 99, extra: 1 } })),
    )
    expect(invalid.result?.isError).toBe(true)
    expect(((invalid.result?.content ?? []) as { text: string }[])[0]!.text).toMatch(/^Paramètres invalides/)
    expect(execute).not.toHaveBeenCalled()
  })

  it("ToolError montrée au modèle ; autre exception : -32603 générique et onError", async () => {
    const writer = setup({ authenticate: () => ({ user: "u1", scopes: ["mail:read", "mail:write"] }) })
    const known = await rpc(
      await writer.handler(
        modern("tools/call", { name: "update_domain", arguments: { domain: "x.ch", tracking: true } }),
      ),
    )
    expect(known.result).toMatchObject({ isError: true, content: [{ type: "text", text: "Domaine inconnu : x.ch." }] })
    const crash = await rpc(
      await writer.handler(
        modern("tools/call", { name: "update_domain", arguments: { domain: "boom.ch", tracking: true } }),
      ),
    )
    expect(crash.error).toEqual({ code: -32603, message: "Erreur interne de l'outil." })
    expect(JSON.stringify(crash)).not.toContain("secret")
    expect(writer.onError).toHaveBeenCalledOnce()
  })

  it("résultat hors outputSchema : -32603", async () => {
    const { handler, onError } = setup({ execute: async () => ({ domains: "pas un tableau" }) })
    const { error } = await rpc(await handler(modern("tools/call", { name: "list_domains", arguments: {} })))
    expect(error?.code).toBe(-32603)
    expect(onError).toHaveBeenCalledOnce()
  })

  it("version inconnue : 400 et -32022 avec les versions servies", async () => {
    const { handler } = setup()
    const request = new Request(URL_MCP, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": "2099-01-01", "mcp-method": "ping" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "2099-01-01" } },
      }),
    })
    const response = await handler(request)
    expect(response.status).toBe(400)
    const { error } = await rpc(response)
    expect(error?.code).toBe(-32022)
    expect(error?.data).toEqual({ supported: ["2026-07-28", "2025-11-25", "2025-06-18"], requested: "2099-01-01" })
  })

  it("en-têtes qui ne correspondent pas au corps : 400 et -32020", async () => {
    const { handler } = setup()
    const cases = [
      modern("ping", {}, { "mcp-protocol-version": "2025-11-25" }),
      modern("tools/list", {}, { "mcp-method": "ping" }),
      modern("tools/call", { name: "list_domains", arguments: {} }, { "mcp-name": "send_email" }),
    ]
    for (const request of cases) {
      const response = await handler(request)
      expect(response.status).toBe(400)
      expect((await rpc(response)).error?.code).toBe(-32020)
    }
    const encoded = modern(
      "tools/call",
      { name: "list_domains", arguments: {} },
      { "mcp-name": "=?base64?bGlzdF9kb21haW5z?=" },
    )
    expect((await rpc(await handler(encoded))).result?.structuredContent).toBeDefined()
  })

  it("capacités du client absentes : 400 et -32602", async () => {
    const { handler } = setup()
    const request = new Request(URL_MCP, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "ping" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } },
      }),
    })
    const response = await handler(request)
    expect(response.status).toBe(400)
    expect((await rpc(response)).error?.code).toBe(-32602)
  })

  it("méthode inconnue : 404 et -32601", async () => {
    const { handler } = setup()
    const response = await handler(modern("resources/list"))
    expect(response.status).toBe(404)
    expect((await rpc(response)).error?.code).toBe(-32601)
  })
})

describe("révisions 2025-11-25 et 2025-06-18 (initialize)", () => {
  it("initialize négocie la version demandée, sinon la plus récente", async () => {
    const { handler } = setup()
    for (const [asked, expected] of [
      ["2025-06-18", "2025-06-18"],
      ["2025-11-25", "2025-11-25"],
      ["2024-11-05", "2025-11-25"],
    ]) {
      const response = await handler(
        legacy({
          jsonrpc: "2.0",
          id: "i",
          method: "initialize",
          params: { protocolVersion: asked, capabilities: {}, clientInfo: { name: "c", version: "1" } },
        }),
      )
      expect(response.headers.get("mcp-session-id")).toBeNull()
      const { id, result } = await rpc(response)
      expect(id).toBe("i")
      expect(result).toEqual({
        protocolVersion: expected,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mail", title: "Mail", version: "1.0.0" },
        instructions: "Commence par list_domains.",
      })
    }
  })

  it("tools/list et tools/call avec MCP-Protocol-Version, sans resultType", async () => {
    const { handler } = setup()
    const headers = { "mcp-protocol-version": "2025-06-18" }
    const list = await rpc(await handler(legacy({ jsonrpc: "2.0", id: 2, method: "tools/list" }, headers)))
    expect(list.result).not.toHaveProperty("resultType")
    expect(((list.result?.tools ?? []) as unknown[]).length).toBe(1)
    const call = await rpc(
      await handler(
        legacy(
          { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_domains", arguments: {} } },
          headers,
        ),
      ),
    )
    expect(call.result).toEqual({
      content: [{ type: "text", text: '{"domains":["a.ch","b.ch"]}' }],
      structuredContent: { domains: ["a.ch", "b.ch"] },
    })
  })

  it("sans MCP-Protocol-Version ou avec une version non servie : 400", async () => {
    const { handler } = setup()
    const missing = await handler(legacy({ jsonrpc: "2.0", id: 1, method: "tools/list" }))
    expect(missing.status).toBe(400)
    const old = await handler(
      legacy({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "mcp-protocol-version": "2025-03-26" }),
    )
    expect(old.status).toBe(400)
    expect((await rpc(old)).error?.data).toMatchObject({ requested: "2025-03-26" })
  })

  it("serveur moderne seul : initialize refusé en nommant les versions", async () => {
    const { handler } = setup({ protocolVersions: ["2026-07-28"] })
    const response = await handler(
      legacy({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }),
    )
    expect(response.status).toBe(400)
    expect((await rpc(response)).error?.message).toContain("2026-07-28")
  })
})

describe("carte du serveur (SEP-2127)", () => {
  it("carte et catalogue", async () => {
    const card = serverCard({
      name: "ch.hgdc/mail",
      title: "Mail",
      version: "1.0.0",
      description: "E-mails transactionnels et campagnes, hébergés en Suisse.",
      url: URL_MCP,
      protocolVersions: ["2026-07-28", "2025-11-25"],
    })
    expect(card).toMatchObject({
      $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
      remotes: [{ type: "streamable-http", url: URL_MCP, supportedProtocolVersions: ["2026-07-28", "2025-11-25"] }],
    })
    const response = serverCardResponse(card)
    expect(response.headers.get("content-type")).toBe("application/mcp-server-card+json")
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(aiCatalog([{ identifier: "urn:air:hgdc.ch:mcp:mail", url: `${URL_MCP}/server-card` }]).entries[0]).toEqual({
      identifier: "urn:air:hgdc.ch:mcp:mail",
      type: "application/mcp-server-card+json",
      url: `${URL_MCP}/server-card`,
    })
  })

  it("refuse un nom ou une description hors du schéma", () => {
    const base = { version: "1", url: URL_MCP, protocolVersions: [] }
    expect(() => serverCard({ ...base, name: "mail", description: "x" })).toThrow(/Nom de carte invalide/)
    expect(() => serverCard({ ...base, name: "ch.hgdc/mail", description: "x".repeat(101) })).toThrow(
      /1 à 100 caractères/,
    )
  })
})
