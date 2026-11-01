/**
 * Relais du serveur MCP d'un produit, servi sous `app.hgdc.ch/<produit>/mcp`, vers les actions HTTP
 * de Convex, où vit le serveur MCP. La passerelle envoie `/<produit>/*` à la console du produit, qui
 * relaie ici. Seuls les en-têtes du protocole et `authorization` passent, jamais `cookie` : le visiteur
 * n'a pas de session à transmettre sur `/mcp`. Le corps est plafonné à 1 Mio, comme côté Convex.
 *
 * L'adresse du visiteur part signée (`addressSecret`, secret partagé avec Convex) : la limite des
 * échecs d'authentification de Convex compte chaque visiteur, pas le conteneur du front.
 */
import { signClientAddress, visitorAddress } from "./client-address.ts"
import { mcpResource, type McpProduct } from "./mcp.ts"

/** En-têtes qui décrivent le transport de Convex vers ce serveur, pas la réponse au visiteur. */
const HOP_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"]
/** Aucun cookie posé par Convex n'atteint le visiteur : le relais ne sert que le protocole MCP. */
const DROPPED_HEADERS: readonly string[] = [...HOP_HEADERS, "set-cookie"]
/** En-têtes de la requête relayés : le protocole MCP et `authorization`, rien d'autre. */
const FORWARDED = [
  "content-type",
  "accept",
  "origin",
  "authorization",
  "mcp-protocol-version",
  "mcp-session-id",
  "mcp-method",
  "mcp-name",
  "last-event-id",
]
/** Délai d'une réponse de Convex avant de rendre une erreur au visiteur. */
const MCP_TIMEOUT_MS = 60_000

export const MAX_MCP_BODY_BYTES: number = 1024 * 1024

export type McpProxyOptions = {
  /** Le produit dont le serveur MCP est relayé : son chemin public vient de `mcpResource`. */
  product: McpProduct
  /** Base de la console sous `app.hgdc.ch` (`/host`), retirée avant le relais. */
  basePath?: string
  /**
   * Préfixe des routes chez Convex, quand le serveur MCP partage le déploiement d'un autre produit (Manager sur
   * le Convex d'ID : `/manager` donne `/manager/mcp`). Absent : les routes à la racine.
   */
  convexPrefix?: string
  /** Secret partagé avec Convex : sans lui, l'adresse du visiteur n'est pas signée. */
  addressSecret?: () => string | undefined
  /** Client HTTP, à remplacer dans les tests. */
  fetch?: typeof fetch
}

/** Le corps entier, ou `null` s'il dépasse `max` : lu par morceaux, jamais plus que `max` en mémoire. */
async function readCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null
  if (!request.body) return new Uint8Array(0)
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
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/** Chemin vu par Convex : sans la base de la console (`/host/mcp` devient `/mcp`), sur une frontière de segment. */
export function convexPath(pathname: string, basePath: string): string {
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`)))
    return pathname.slice(basePath.length) || "/"
  return pathname
}

/**
 * Relais de `/mcp`, `/mcp/server-card` et du document RFC 9728 de la ressource du produit. Le document
 * vit à la racine de l'hôte, sous le chemin de la ressource (`/.well-known/oauth-protected-resource/host/mcp`) ;
 * la passerelle le relaie sous la base de la console, Convex le sert sans elle. Toute autre route : 404.
 */
export function createMcpProxy(
  convexSiteUrl: string,
  options: McpProxyOptions,
): (request: Request) => Promise<Response> {
  const basePath = options.basePath ?? ""
  const resourcePath = new URL(mcpResource(options.product)).pathname
  const prefix = (options.convexPrefix ?? "").replace(/\/+$/, "")
  if (prefix && !/^(\/[a-z0-9-]+)+$/.test(prefix))
    throw new Error(`createMcpProxy : convexPrefix invalide (${JSON.stringify(options.convexPrefix)}).`)
  const routes = new Map<string, string>([
    ["/mcp", `${prefix}/mcp`],
    ["/mcp/server-card", `${prefix}/mcp/server-card`],
    [`/.well-known/oauth-protected-resource${resourcePath}`, `${prefix}/.well-known/oauth-protected-resource/mcp`],
  ])
  const fetchImpl = options.fetch ?? fetch
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const convexRoute = routes.get(convexPath(url.pathname, basePath))
    if (!convexRoute) return new Response(null, { status: 404 })
    const target = new URL(convexRoute, convexSiteUrl)
    const headers = new Headers()
    for (const name of FORWARDED) {
      const value = request.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
    // Pose ou retire l'adresse signée : une adresse envoyée par le visiteur ne passe jamais.
    await signClientAddress(headers, {
      address: visitorAddress(request.headers),
      method: request.method,
      target,
      secret: options.addressSecret?.(),
    })
    let body: Uint8Array<ArrayBuffer> | undefined
    if (request.method !== "GET" && request.method !== "HEAD") {
      const read = await readCapped(request, MAX_MCP_BODY_BYTES)
      if (!read) return new Response("Corps trop volumineux.", { status: 413 })
      body = read
    }
    let upstream: Response
    try {
      upstream = await fetchImpl(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
      })
    } catch {
      return Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "Le serveur MCP ne répond pas. Réessaie dans un instant." },
        },
        { status: 502 },
      )
    }
    const out = new Headers(upstream.headers)
    for (const name of DROPPED_HEADERS) out.delete(name)
    return new Response(upstream.body, { status: upstream.status, headers: out })
  }
}
