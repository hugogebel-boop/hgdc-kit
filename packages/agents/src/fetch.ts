// Version Markdown des pages d'une app rendue côté serveur (TanStack Start, ou tout handler `fetch`).
import { htmlToMarkdown } from "./markdown.js"
import { prefersMarkdown, varyOnAccept } from "./negotiate.js"

export type MarkdownOptions = {
  /** Markdown ajouté en pied de chaque page, après une ligne `---` : liens vers llms.txt, sitemap, contact. */
  footer?: string
}

/** Pied de page standard : une ligne de liens, `[libellé](adresse)` séparés par « · ». */
export function linksFooter(links: { label: string; href: string }[]): string {
  return links.map((l) => `[${l.label}](${l.href})`).join(" · ")
}

const isHtml = (response: Response) => /^text\/html\b/i.test(response.headers.get("content-type") ?? "")

// En-têtes qui décrivent le corps HTML et deviennent faux pour le Markdown.
const BODY_HEADERS = ["content-type", "content-length", "content-encoding", "etag", "last-modified", "content-md5"]

/**
 * Enrobe un handler `fetch` : une requête GET ou HEAD qui préfère `text/markdown` reçoit la page HTML
 * convertie, au même statut (404 compris), avec `Content-Type: text/markdown` et `Vary: Accept`. Les autres
 * requêtes passent telles quelles ; leurs pages HTML reçoivent `Vary: Accept`. Une redirection, un fichier
 * ou du JSON ne sont jamais convertis.
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
    if (!read || !prefersMarkdown(request.headers.get("accept"))) {
      const response = await handler(request, ...rest)
      if (read && isHtml(response)) return withHeaders(response, response.body, varyOnAccept)
      return response
    }

    const headers = new Headers(request.headers)
    headers.set("accept", "text/html")
    // Requête reconstruite depuis l'URL : le Request de Nitro (srvx) n'est pas celui d'undici, et
    // `new Request(request, …)` le refuse. HEAD est rendu en GET, sinon le corps à convertir serait vide.
    const response = await handler(
      new Request(request.url, { method: "GET", headers, signal: request.signal }),
      ...rest,
    )
    if (!isHtml(response) || response.status < 200 || (response.status >= 300 && response.status < 400))
      return withHeaders(response, request.method === "HEAD" ? null : response.body, varyOnAccept)

    const html = await response.text()
    const markdown = htmlToMarkdown(html, request.url) + (options.footer ? `\n---\n\n${options.footer}\n` : "")
    return withHeaders(response, request.method === "HEAD" ? null : markdown, (out) => {
      for (const name of BODY_HEADERS) out.delete(name)
      out.set("content-type", "text/markdown; charset=utf-8")
      varyOnAccept(out)
    })
  }
}

function withHeaders(response: Response, body: BodyInit | null, edit: (headers: Headers) => void): Response {
  const headers = new Headers(response.headers)
  edit(headers)
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}
