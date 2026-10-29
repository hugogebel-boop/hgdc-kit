import { mcpTools, parseArguments, ToolError, type McpToolSet, type McpToolSpec } from "./mcp-tools.ts"

export * from "./mcp-tools.ts"
export * from "./mcp-card.ts"

/*
 * Serveur MCP en Streamable HTTP, sans état, indépendant du framework : `(Request) => Response`,
 * à poser dans un `httpAction` Convex ou une route serveur TanStack Start.
 *
 * - Révision visée 2026-07-28 (« moderne ») : pas de session ni de poignée de main, chaque requête
 *   porte sa version et les capacités du client dans `_meta`, les en-têtes `MCP-Protocol-Version`,
 *   `Mcp-Method` et `Mcp-Name` doivent égaler le corps (`HeaderMismatch` -32020), une version
 *   inconnue rend `UnsupportedProtocolVersion` (-32022), `server/discover` est servi.
 * - Révisions 2025-11-25 et 2025-06-18 (« anciennes ») : `initialize` négocie la version, sans
 *   `Mcp-Session-Id` ; chaque requête suivante porte `MCP-Protocol-Version`.
 * - Toujours : POST seul (GET et DELETE en 405), réponse JSON (jamais de flux SSE), notification
 *   en 202, aucun lot JSON-RPC (aucune des trois révisions ne les admet), `Origin` vérifiée,
 *   corps plafonné, authentification par le produit avant toute méthode.
 */

export const MODERN_VERSIONS = ["2026-07-28"] as const
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18"] as const
export const PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18"] as const
export type ProtocolVersion = (typeof PROTOCOL_VERSIONS)[number]

/** Codes d'erreur JSON-RPC utilisés (JSON-RPC 2.0 et spécification MCP 2026-07-28). */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
} as const

export type McpServerInfo = { name: string; title?: string; version: string }

export type ToolCall<Ctx> = { name: string; input: Record<string, unknown>; tool: McpToolSpec; context: Ctx }

export type McpHandlerOptions<Ctx> = {
  server: McpServerInfo
  /** Consigne lue par le modèle : ce que fait le serveur, par quel outil commencer. */
  instructions?: string
  tools: McpToolSet
  /**
   * Authentifie la requête : rend le contexte (personne, organisation, scopes) ou une `Response`
   * (401 de `unauthorized()` de `@hgdc/api/bearer`). Appelé pour chaque requête sauf les notifications.
   */
  authenticate: (request: Request) => Promise<Ctx | Response> | Ctx | Response
  /** Exécute un outil dont les arguments sont vérifiés. Lever `ToolError` pour une erreur montrée au modèle. */
  execute: (call: ToolCall<Ctx>) => unknown
  /** Un outil est-il visible et appelable dans ce contexte ? (outils d'écriture masqués sans `<p>:write`). */
  canUse?: (context: Ctx, name: string, tool: McpToolSpec) => boolean
  /** Origines de navigateur acceptées en plus de celle du serveur. Toute autre `Origin` reçoit 403. */
  allowedOrigins?: readonly string[]
  /** Taille maximale du corps en octets (1 Mio par défaut). */
  maxBodyBytes?: number
  /** Versions servies (toutes par défaut). */
  protocolVersions?: readonly ProtocolVersion[]
  /** Durée de cache annoncée pour `tools/list` et `server/discover` (révision moderne), en ms. */
  listTtlMs?: number
  /** Erreur inattendue (exception d'un outil, résultat hors schéma) : à remonter à GlitchTip. */
  onError?: (error: unknown, info: { method: string; tool?: string }) => void
}

type Id = string | number | null
type JsonObject = Record<string, unknown>

const DEFAULT_MAX_BODY = 1024 * 1024
const META_VERSION = "io.modelcontextprotocol/protocolVersion"
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities"
const META_SERVER = "io.modelcontextprotocol/serverInfo"

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function rpcError(id: Id, code: number, message: string, status = 200, data?: unknown): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined && { data }) } }, status)
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function acceptsJson(accept: string): boolean {
  return accept.split(",").some((part) => {
    const type = part.split(";")[0]!.trim().toLowerCase()
    return type === "application/json" || type === "application/*" || type === "*/*"
  })
}

/** Le corps en texte, ou `null` s'il dépasse `max` octets (lu par morceaux, jamais en entier avant). */
async function readLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > max) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** Valeur d'en-tête MCP, décodée si elle suit la forme `=?base64?…?=`. `null` si illisible. */
export function decodeHeaderValue(value: string): string | null {
  const match = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/.exec(value)
  if (!match) return value
  try {
    const bytes = Uint8Array.from(atob(match[1]!), (c) => c.charCodeAt(0))
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function shortName(name: string): string {
  return name.length > 64 ? `${name.slice(0, 64)}…` : name
}

/** Le gestionnaire HTTP du serveur MCP d'un produit. */
export function createMcpHandler<Ctx>(options: McpHandlerOptions<Ctx>): (request: Request) => Promise<Response> {
  const versions: readonly ProtocolVersion[] = options.protocolVersions ?? PROTOCOL_VERSIONS
  const modern = MODERN_VERSIONS.filter((v) => versions.includes(v)) as string[]
  const legacy = LEGACY_VERSIONS.filter((v) => versions.includes(v)) as string[]
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY
  const ttlMs = options.listTtlMs ?? 300_000
  const allowed = new Set(options.allowedOrigins ?? [])
  const canUse = (context: Ctx, name: string, tool: McpToolSpec) => options.canUse?.(context, name, tool) ?? true

  function result(id: Id, isModern: boolean, value: JsonObject): Response {
    const body = isModern ? { ...value, resultType: "complete", _meta: { [META_SERVER]: options.server } } : value
    return json({ jsonrpc: "2.0", id, result: body })
  }

  function unsupported(id: Id, requested: unknown): Response {
    return rpcError(id, RPC.unsupportedProtocolVersion, "Unsupported protocol version", 400, {
      supported: versions,
      requested,
    })
  }

  async function callTool(id: Id, isModern: boolean, params: JsonObject, context: Ctx): Promise<Response> {
    const name = params.name
    if (typeof name !== "string") return rpcError(id, RPC.invalidParams, "params.name est requis.")
    const args = params.arguments
    if (args !== undefined && !isObject(args))
      return rpcError(id, RPC.invalidParams, "params.arguments doit être un objet.")
    const tool = Object.hasOwn(options.tools, name) ? options.tools[name] : undefined
    if (!tool || !canUse(context, name, tool))
      return rpcError(id, RPC.invalidParams, `Unknown tool: ${shortName(name)}`)

    const toolError = (text: string) => result(id, isModern, { content: [{ type: "text", text }], isError: true })
    const parsed = parseArguments(tool, args)
    if (!parsed.ok) return toolError(parsed.message)

    let value: unknown
    try {
      value = await options.execute({ name, input: parsed.input, tool, context })
    } catch (error) {
      if (error instanceof ToolError) return toolError(error.message)
      options.onError?.(error, { method: "tools/call", tool: name })
      return rpcError(id, RPC.internalError, "Erreur interne de l'outil.")
    }

    if (tool.output) {
      const checked = tool.output.safeParse(value)
      if (!checked.success) {
        options.onError?.(new Error(`Résultat de ${name} hors de son outputSchema`), {
          method: "tools/call",
          tool: name,
        })
        return rpcError(id, RPC.internalError, "Erreur interne de l'outil.")
      }
      const text = JSON.stringify(checked.data) ?? "null"
      return result(id, isModern, { content: [{ type: "text", text }], structuredContent: checked.data })
    }
    const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "null")
    return result(id, isModern, { content: [{ type: "text", text }] })
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } })

    const origin = request.headers.get("origin")
    if (origin !== null && origin !== new URL(request.url).origin && !allowed.has(origin))
      return rpcError(null, RPC.invalidRequest, "Origine refusée.", 403)

    if (!/^application\/json(\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
      return rpcError(null, RPC.invalidRequest, "Content-Type doit être application/json.", 415)
    const accept = request.headers.get("accept")
    if (accept && !acceptsJson(accept))
      return rpcError(null, RPC.invalidRequest, "Accept doit inclure application/json.", 406)

    const text = await readLimited(request, maxBody)
    if (text === null) return rpcError(null, RPC.invalidRequest, `Corps limité à ${maxBody} octets.`, 413)

    let message: unknown
    try {
      message = JSON.parse(text)
    } catch {
      return rpcError(null, RPC.parseError, "Parse error", 400)
    }
    if (Array.isArray(message))
      return rpcError(null, RPC.invalidRequest, "Les lots JSON-RPC ne sont pas acceptés.", 400)
    if (!isObject(message) || message.jsonrpc !== "2.0")
      return rpcError(null, RPC.invalidRequest, "Invalid Request", 400)

    // Réponse ou notification du client : rien à faire, rien à rendre (202).
    if (!("method" in message)) {
      if ("result" in message || "error" in message) return new Response(null, { status: 202 })
      return rpcError(null, RPC.invalidRequest, "Invalid Request", 400)
    }
    const method = message.method
    if (typeof method !== "string") return rpcError(null, RPC.invalidRequest, "Invalid Request", 400)
    if (!("id" in message)) return new Response(null, { status: 202 })
    const id = message.id
    if (typeof id !== "string" && (typeof id !== "number" || !Number.isFinite(id)))
      return rpcError(null, RPC.invalidRequest, "id doit être une chaîne ou un nombre.", 400)

    const params = message.params ?? {}
    if (!isObject(params)) return rpcError(id, RPC.invalidParams, "params doit être un objet.", 400)
    const meta = isObject(params._meta) ? params._meta : undefined
    const headerVersion = request.headers.get("mcp-protocol-version")

    // Révision de la requête : moderne si elle porte sa version dans `_meta` (ou l'annonce en en-tête).
    const isModern =
      meta?.[META_VERSION] !== undefined ||
      (method !== "initialize" &&
        headerVersion !== null &&
        (MODERN_VERSIONS as readonly string[]).includes(headerVersion))

    if (isModern) {
      const requested = meta?.[META_VERSION]
      if (typeof requested !== "string")
        return rpcError(id, RPC.invalidParams, `_meta["${META_VERSION}"] est requis.`, 400)
      if (!modern.includes(requested)) return unsupported(id, requested)
      if (headerVersion !== requested)
        return rpcError(id, RPC.headerMismatch, "Header mismatch: MCP-Protocol-Version", 400)
      if (request.headers.get("mcp-method") !== method)
        return rpcError(id, RPC.headerMismatch, "Header mismatch: Mcp-Method", 400)
      if (method === "tools/call") {
        const header = request.headers.get("mcp-name")
        if (header === null || decodeHeaderValue(header) !== params.name)
          return rpcError(id, RPC.headerMismatch, "Header mismatch: Mcp-Name", 400)
      }
      if (!isObject(meta?.[META_CAPABILITIES]))
        return rpcError(id, RPC.invalidParams, `_meta["${META_CAPABILITIES}"] est requis.`, 400)
    } else if (method === "initialize") {
      if (legacy.length === 0)
        return rpcError(id, RPC.invalidRequest, `Protocole servi : ${versions.join(", ")}, sans initialize.`, 400)
    } else if (headerVersion === null || !legacy.includes(headerVersion)) {
      return rpcError(
        id,
        RPC.invalidRequest,
        `En-tête MCP-Protocol-Version manquant ou non pris en charge (${versions.join(", ")}).`,
        400,
        { supported: versions, requested: headerVersion },
      )
    }

    const auth = await options.authenticate(request)
    if (auth instanceof Response) return auth
    const context = auth as Ctx

    switch (method) {
      case "initialize": {
        const asked = params.protocolVersion
        const protocolVersion = typeof asked === "string" && legacy.includes(asked) ? asked : legacy[0]!
        return result(id, false, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: options.server,
          ...(options.instructions && { instructions: options.instructions }),
        })
      }
      case "server/discover":
        return result(id, isModern, {
          supportedVersions: versions,
          capabilities: { tools: {} },
          ...(options.instructions && { instructions: options.instructions }),
          ...(isModern && { ttlMs, cacheScope: "public" }),
        })
      case "ping":
        return result(id, isModern, {})
      case "tools/list":
        return result(id, isModern, {
          tools: mcpTools(options.tools, (name, tool) => canUse(context, name, tool)),
          // La liste dépend des droits du jeton : cache privé.
          ...(isModern && { ttlMs, cacheScope: "private" }),
        })
      case "tools/call":
        return await callTool(id, isModern, params, context)
      default:
        return rpcError(id, RPC.methodNotFound, "Method not found", isModern ? 404 : 200)
    }
  }
}
