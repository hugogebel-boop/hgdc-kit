/*
 * Carte d'un serveur MCP (extension Server Card, SEP-2127) : identité et adresse du serveur, lues
 * avant toute connexion. Elle ne liste pas les outils (le client les lit par `tools/list`).
 * Emplacement réservé : `GET <adresse MCP>/server-card`, type `application/mcp-server-card+json`.
 * Un catalogue AI Catalog (`/.well-known/ai-catalog.json`) pointe vers les cartes d'un domaine.
 */

export const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json"
export const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json"
export const AI_CATALOG_MEDIA_TYPE = "application/ai-catalog+json"

export type ServerCard = {
  $schema: string
  /** Nom en DNS inversé, une seule barre : `ch.hgdc/mail`. */
  name: string
  version: string
  /** 100 caractères au plus. */
  description: string
  title?: string
  websiteUrl?: string
  repository?: { url: string; source: string; subfolder?: string; id?: string }
  icons?: { src: string; mimeType?: string; sizes?: string[] }[]
  remotes?: { type: "streamable-http"; url: string; supportedProtocolVersions?: string[] }[]
  _meta?: Record<string, unknown>
}

const CARD_NAME = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/

/** La carte d'un serveur Streamable HTTP. Lève sur un nom ou une description hors des limites du schéma. */
export function serverCard(options: {
  name: string
  version: string
  description: string
  url: string
  protocolVersions: readonly string[]
  title?: string
  websiteUrl?: string
  icons?: ServerCard["icons"]
}): ServerCard {
  if (!CARD_NAME.test(options.name) || options.name.length > 200)
    throw new Error(`Nom de carte invalide : ${options.name}`)
  if (options.description.length < 1 || options.description.length > 100)
    throw new Error("La description de la carte doit compter de 1 à 100 caractères.")
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: options.name,
    version: options.version,
    description: options.description,
    ...(options.title && { title: options.title }),
    ...(options.websiteUrl && { websiteUrl: options.websiteUrl }),
    ...(options.icons && { icons: options.icons }),
    remotes: [{ type: "streamable-http", url: options.url, supportedProtocolVersions: [...options.protocolVersions] }],
  }
}

const PUBLIC_JSON_HEADERS = {
  "cache-control": "public, max-age=3600",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET",
  "access-control-allow-headers": "Content-Type, If-None-Match",
}

/** La réponse de la carte : publique, lisible depuis un navigateur, en cache une heure. */
export function serverCardResponse(card: ServerCard): Response {
  return new Response(JSON.stringify(card), {
    headers: { ...PUBLIC_JSON_HEADERS, "content-type": SERVER_CARD_MEDIA_TYPE },
  })
}

export type AiCatalog = {
  specVersion: "1.0"
  entries: { identifier: string; type: typeof SERVER_CARD_MEDIA_TYPE; url: string }[]
}

/** Catalogue d'un domaine : une entrée par carte. `identifier` au format `urn:air:<domaine>:mcp:<nom>`. */
export function aiCatalog(entries: { identifier: string; url: string }[]): AiCatalog {
  return {
    specVersion: "1.0",
    entries: entries.map((entry) => ({ identifier: entry.identifier, type: SERVER_CARD_MEDIA_TYPE, url: entry.url })),
  }
}

export function aiCatalogResponse(catalog: AiCatalog): Response {
  return new Response(JSON.stringify(catalog), {
    headers: { ...PUBLIC_JSON_HEADERS, "content-type": AI_CATALOG_MEDIA_TYPE },
  })
}
