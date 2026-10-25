// Ce qui aide un agent à trouver les ressources d'un site sans lire son HTML : robots d'IA reconnus, jumeau
// `.md` de chaque page, en-tête `Link` (RFC 8288) et catalogue d'API (RFC 9727).

// Robots et assistants qui lisent une page pour un modèle : ils reçoivent le Markdown même sans le demander.
// Les moteurs de recherche classiques (Googlebot, Bingbot) gardent le HTML.
const AGENT_USER_AGENTS =
  /\b(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User)\b/i

/** Vrai pour le User-Agent d'un robot ou d'un assistant d'IA connu. */
export function isAgentUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && AGENT_USER_AGENTS.test(userAgent)
}

/** Adresse du jumeau Markdown d'une page : `/` → `/index.md`, `/mail/` → `/mail/index.md`, `/tarifs` → `/tarifs.md`. */
export function markdownTwin(pathname: string): string {
  return pathname.endsWith("/") ? `${pathname}index.md` : `${pathname}.md`
}

/** Page dont `pathname` est le jumeau Markdown, ou `null` : l'inverse de `markdownTwin`. */
export function pageOfTwin(pathname: string): string | null {
  if (!pathname.endsWith(".md")) return null
  if (pathname.endsWith("/index.md")) return pathname.slice(0, -"index.md".length)
  return pathname.slice(0, -".md".length) || null
}

/** Cible d'un lien du catalogue d'API (RFC 9264). */
export type LinkTarget = { href: string; type?: string; title?: string }

/** Une API du catalogue (RFC 9727) : son adresse de base et ses descriptions. */
export type ApiCatalogEntry = {
  anchor: string
  /** Description lisible par une machine : spec OpenAPI, carte de serveur MCP. */
  "service-desc"?: LinkTarget[]
  /** Documentation pour un humain ou un modèle. */
  "service-doc"?: LinkTarget[]
  /** Conditions, politique de version, limites. */
  "service-meta"?: LinkTarget[]
  /** État du service. */
  status?: LinkTarget[]
}

export const API_CATALOG_PATH = "/.well-known/api-catalog"
export const API_CATALOG_TYPE = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'

/** Réponse du catalogue d'API (RFC 9727) ; HEAD reçoit les en-têtes et le lien vers lui-même, sans corps. */
export function apiCatalogResponse(entries: readonly ApiCatalogEntry[], method: string, path: string): Response {
  const body = method === "HEAD" ? null : `${JSON.stringify({ linkset: entries }, null, 2)}\n`
  return new Response(body, {
    headers: { "content-type": API_CATALOG_TYPE, link: `<${path}>; rel="api-catalog"` },
  })
}

/** Ajoute des valeurs à l'en-tête `Link`, sans doublon. */
export function appendLinks(headers: Headers, links: readonly string[]): void {
  const current = headers.get("link")
  const all = current ? [current, ...links.filter((link) => !current.includes(link))] : [...links]
  if (all.length) headers.set("link", all.join(", "))
}
