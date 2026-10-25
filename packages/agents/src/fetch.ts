// Ce qu'une app rendue côté serveur (TanStack Start, ou tout handler `fetch`) montre aux agents : la page en
// Markdown, ses données structurées et son adresse canonique, les pages de confiance, des erreurs d'API en JSON.
import {
  API_CATALOG_PATH,
  apiCatalogResponse,
  appendLinks,
  isAgentUserAgent,
  markdownTwin,
  pageOfTwin,
  type ApiCatalogEntry,
} from "./discovery.js"
import { canonicalLink, injectIntoHead, jsonLdScript } from "./head.js"
import { htmlToMarkdown, pageFrontmatter } from "./markdown.js"
import { prefersMarkdown, varyOn, varyOnAccept } from "./negotiate.js"

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
  /**
   * Valeurs ajoutées à l'en-tête `Link` (RFC 8288) des pages, après l'alternative Markdown :
   * `</llms.txt>; rel="describedby"`, `</.well-known/api-catalog>; rel="api-catalog"`…
   */
  links?: readonly string[]
  /** Catalogue d'API (RFC 9727), servi à toute adresse qui finit par `/.well-known/api-catalog`. */
  apiCatalog?: readonly ApiCatalogEntry[]
  /** Documents Markdown servis tels quels, par chemin exact : `/auth.md`, `/pricing.md`. */
  markdownFiles?: Readonly<Record<string, string>>
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
    const file = read ? options.markdownFiles?.[url.pathname] : undefined
    if (file !== undefined)
      return new Response(request.method === "HEAD" ? null : file, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      })
    if (read && options.apiCatalog && url.pathname.endsWith(API_CATALOG_PATH))
      return apiCatalogResponse(options.apiCatalog, request.method, url.pathname)

    // Markdown demandé par l'en-tête Accept, par un robot d'IA connu, par `?mode=agent` ou par le suffixe `.md`.
    const wanted =
      read &&
      (prefersMarkdown(request.headers.get("accept")) ||
        isAgentUserAgent(request.headers.get("user-agent")) ||
        url.searchParams.get("mode") === "agent")
    const twin = read ? pageOfTwin(url.pathname) : null
    // Requête reconstruite depuis l'URL : le Request de Nitro (srvx) n'est pas celui d'undici, et
    // `new Request(request, …)` le refuse. HEAD est rendu en GET, sinon le corps à convertir serait vide.
    const render = (target: URL) =>
      handler(
        new Request(target.href, { method: "GET", headers: htmlAccept(request.headers), signal: request.signal }),
        ...rest,
      )
    let page = url
    let response = wanted || twin ? await render(url) : await handler(request, ...rest)
    // Un `.md` que l'app ne sert pas elle-même est le jumeau Markdown de sa page.
    if (twin && response.status === 404) {
      page = new URL(twin + url.search, url)
      response = await render(page)
    }
    const markdown = wanted || page !== url
    if (!read || !isHtml(response)) return response

    if (options.apiPrefix && response.status === 404 && isUnder(page.pathname, options.apiPrefix))
      return apiNotFound(page.pathname, options.apiHint)

    const redirected = response.status >= 300 && response.status < 400
    const ok = response.status >= 200 && response.status < 300
    if (!markdown || response.status < 200 || redirected)
      return withHeaders(response, request.method === "HEAD" ? null : enrichHead(response, page, options), (out) => {
        varyOnPage(out)
        if (ok)
          appendLinks(out, [
            `<${markdownTwin(page.pathname)}>; rel="alternate"; type="text/markdown"`,
            ...(options.links ?? []),
          ])
      })

    const html = await response.text()
    // Métadonnées en tête ; l'adresse canonique seulement si l'origine publique est connue (une console
    // relayée voit l'adresse de son relais, pas celle du visiteur).
    const canonical = options.canonicalOrigin ? `${options.canonicalOrigin}${page.pathname}` : undefined
    const text =
      pageFrontmatter(html, canonical) +
      htmlToMarkdown(html, page.href) +
      (options.footer ? `\n---\n\n${options.footer}\n` : "")
    return withHeaders(response, request.method === "HEAD" ? null : text, (out) => {
      for (const name of BODY_HEADERS) out.delete(name)
      out.set("content-type", "text/markdown; charset=utf-8")
      varyOnPage(out)
      if (ok) appendLinks(out, [`<${page.pathname}>; rel="alternate"; type="text/html"`, ...(options.links ?? [])])
    })
  }
}

// Une page change selon Accept et selon le User-Agent (robots d'IA).
function varyOnPage(headers: Headers) {
  varyOnAccept(headers)
  varyOn(headers, "User-Agent")
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
