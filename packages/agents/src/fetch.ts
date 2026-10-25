// Ce qu'une app rendue côté serveur (TanStack Start, ou tout handler `fetch`) montre aux agents : la page en
// Markdown, ses données structurées et son adresse canonique, les pages de confiance, des erreurs d'API en JSON.
import { canonicalLink, injectIntoHead, jsonLdScript } from "./head.js"
import { htmlToMarkdown } from "./markdown.js"
import { prefersMarkdown, varyOnAccept } from "./negotiate.js"

export type MarkdownOptions = {
  /** Markdown ajouté en pied de chaque page, après une ligne `---` : liens vers llms.txt, sitemap, contact. */
  footer?: string
  /** Redirections permanentes (301) d'un chemin exact vers une adresse : pages de confiance (`HGDC_TRUST_PAGES`). */
  redirects?: Readonly<Record<string, string>>
  /** JSON-LD posé dans le `<head>` de chaque page HTML qui n'en porte pas (`productJsonLd`). */
  jsonLd?: unknown
  /** Origine publique (`https://status.hgdc.ch`) : `<link rel="canonical">` sur chaque page HTML en 200 qui n'en a pas. */
  canonicalOrigin?: string
  /** Préfixe d'API (`/api`) : une page introuvable sous ce préfixe devient une erreur JSON (RFC 9457). */
  apiPrefix?: string
  /** Indication donnée dans ces erreurs JSON : où lire l'API. */
  apiHint?: string
}

/** Pied de page standard : une ligne de liens, `[libellé](adresse)` séparés par « · ». */
export function linksFooter(links: { label: string; href: string }[]): string {
  return links.map((l) => `[${l.label}](${l.href})`).join(" · ")
}

const isHtml = (response: Response) => /^text\/html\b/i.test(response.headers.get("content-type") ?? "")

// En-têtes qui décrivent le corps HTML et deviennent faux pour un autre corps.
const BODY_HEADERS = ["content-type", "content-length", "content-encoding", "etag", "last-modified", "content-md5"]

/**
 * Enrobe un handler `fetch` : une requête GET ou HEAD qui préfère `text/markdown` reçoit la page HTML
 * convertie, au même statut (404 compris), avec `Content-Type: text/markdown` et `Vary: Accept`. Les autres
 * requêtes passent telles quelles ; leurs pages HTML reçoivent `Vary: Accept`, et selon les options le
 * JSON-LD et l'adresse canonique. Une redirection, un fichier ou du JSON ne sont jamais convertis.
 *
 * TanStack Start refuse en 406 une requête sans `text/html` ni `*\/*` : le handler reçoit donc la requête
 * avec `Accept: text/html`.
 */
export function withMarkdown<Rest extends unknown[]>(
  handler: (request: Request, ...rest: Rest) => Response | Promise<Response>,
  options: MarkdownOptions = {},
): (request: Request, ...rest: Rest) => Promise<Response> {
  return async (request, ...rest) => {
    const read = request.method === "GET" || request.method === "HEAD"
    const url = new URL(request.url)
    const redirect = read ? options.redirects?.[url.pathname.replace(/(.)\/$/, "$1")] : undefined
    if (redirect) return new Response(null, { status: 301, headers: { location: redirect } })

    const markdown = read && prefersMarkdown(request.headers.get("accept"))
    const response = markdown
      ? await handler(
          // Requête reconstruite depuis l'URL : le Request de Nitro (srvx) n'est pas celui d'undici, et
          // `new Request(request, …)` le refuse. HEAD est rendu en GET, sinon le corps à convertir serait vide.
          new Request(request.url, { method: "GET", headers: htmlAccept(request.headers), signal: request.signal }),
          ...rest,
        )
      : await handler(request, ...rest)
    if (!read || !isHtml(response)) return response

    if (options.apiPrefix && response.status === 404 && isUnder(url.pathname, options.apiPrefix))
      return apiNotFound(url.pathname, options.apiHint)

    const redirected = response.status >= 300 && response.status < 400
    if (!markdown || response.status < 200 || redirected)
      return withHeaders(response, request.method === "HEAD" ? null : enrichHead(response, url, options), varyOnAccept)

    const text =
      htmlToMarkdown(await response.text(), request.url) + (options.footer ? `\n---\n\n${options.footer}\n` : "")
    return withHeaders(response, request.method === "HEAD" ? null : text, (out) => {
      for (const name of BODY_HEADERS) out.delete(name)
      out.set("content-type", "text/markdown; charset=utf-8")
      varyOnAccept(out)
    })
  }
}

function htmlAccept(original: Headers): Headers {
  const headers = new Headers(original)
  headers.set("accept", "text/html")
  return headers
}

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix.replace(/\/$/, "")}/`)

/** Corps HTML avec le JSON-LD et l'adresse canonique des options, s'il y a lieu. */
function enrichHead(response: Response, url: URL, options: MarkdownOptions): BodyInit | null {
  const canonical =
    options.canonicalOrigin && response.status === 200 ? `${options.canonicalOrigin}${url.pathname}` : null
  if (!response.body || (!options.jsonLd && !canonical)) return response.body
  return injectIntoHead(response.body, (head) => {
    let extra = ""
    if (options.jsonLd && !/application\/ld\+json/i.test(head)) extra += jsonLdScript(options.jsonLd)
    if (canonical && !/rel=["']?canonical/i.test(head)) extra += canonicalLink(canonical)
    return extra
  })
}

/** Adresse inconnue sous l'API : erreur JSON au format RFC 9457 plutôt qu'une page HTML. */
function apiNotFound(path: string, hint?: string): Response {
  const problem = {
    type: "about:blank",
    title: "Ressource introuvable",
    status: 404,
    code: "not_found",
    detail: `Aucune ressource à ${path}.`,
    ...(hint ? { hint } : {}),
  }
  return new Response(JSON.stringify(problem), {
    status: 404,
    headers: { "content-type": "application/problem+json", vary: "Accept" },
  })
}

function withHeaders(response: Response, body: BodyInit | null, edit: (headers: Headers) => void): Response {
  const headers = new Headers(response.headers)
  // Corps réécrit (Markdown, <head> enrichi) : longueur et empreinte d'origine ne valent plus.
  if (body !== response.body) for (const name of ["content-length", "etag", "content-md5"]) headers.delete(name)
  edit(headers)
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}
