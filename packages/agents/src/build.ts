// Sites prérendus (Astro + sortie Build Output API v3, servie par HGDC Host ou Vercel) : écrit la
// version Markdown de chaque page au build et produit les routes qui la servent sur
// `Accept: text/markdown`. Rien ne s'exécute à la requête : tout est fichier statique et route.
import { readdir, readFile, writeFile } from "node:fs/promises"

import { htmlToMarkdown, pageFrontmatter } from "./markdown.js"

/** Route Build Output API v3, sous-ensemble utilisé ici. */
export type Route = {
  src: string
  dest?: string
  status?: number
  headers?: Record<string, string>
  has?: { type: "header" | "query"; key: string; value: string }[]
  continue?: boolean
}

export type MarkdownPage = {
  /** Chemin public de la page : `/`, `/contact`, `/agence/blog/article`. */
  path: string
  /** Fichier Markdown écrit, relatif au dossier du build : `index.md`, `contact.md`. */
  file: string
}

export type MarkdownBuildOptions = {
  /** Origine publique, sans barre finale : `https://hgdc.ch`. */
  site: string
  /** Préfixe du site s'il est servi sous un chemin (`/agence`) ; sa page d'accueil s'écrit `<base>/index.md`. */
  base?: string
  /** Pied de chaque page Markdown, après une ligne `---`. */
  footer?: string
}

const NOT_FOUND = "404.html"
// Valeur de condition commune à Host (edge/src/router.ts) et Vercel : correspondance sur toute la valeur.
const ACCEPTS_MARKDOWN = { type: "header", key: "accept", value: ".*text/markdown.*" } as const
// Mêmes robots que `isAgentUserAgent` (discovery.ts) : ils reçoivent le Markdown sans le demander. La valeur
// d'une condition est une expression ancrée, sensible à la casse.
const AGENT_USER_AGENT = {
  type: "header",
  key: "user-agent",
  value:
    ".*(?:GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User).*",
} as const
const AGENT_MODE = { type: "query", key: "mode", value: "agent" } as const
const WANTS_MARKDOWN = [ACCEPTS_MARKDOWN, AGENT_USER_AGENT, AGENT_MODE]
const VARY = "Accept, User-Agent"
const MARKDOWN_TYPE = "text/markdown; charset=utf-8"
// Host refuse une expression de plus de 4096 caractères : les listes de pages se découpent en dessous.
const MAX_PATTERN = 3000

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Chemin public d'un fichier HTML du build, `null` si ce n'est pas une page. */
function pagePath(file: string): string | null {
  if (file === "index.html") return "/"
  const m = /^(.+)\/index\.html$/.exec(file)
  return m ? `/${m[1]}` : null
}

/** Fichier Markdown d'une page : `index.md` pour la racine (ou le préfixe), `<chemin>.md` sinon. */
function markdownFile(path: string, base: string): string {
  if (path === "/") return "index.md"
  if (path === base) return `${base.slice(1)}/index.md`
  return `${path.slice(1)}.md`
}

/**
 * Écrit `<page>.md` pour chaque page prérendue de `dir` (dossier rendu par Astro, `dist/` : l'adaptateur
 * Vercel le copie ensuite vers `.vercel/output/static`), et `404.md` à côté de chaque `404.html`.
 */
export async function writeMarkdownPages(dir: URL, options: MarkdownBuildOptions): Promise<MarkdownPage[]> {
  const base = options.base ?? ""
  const footer = options.footer ? `\n---\n\n${options.footer}\n` : ""
  const pages: MarkdownPage[] = []
  const files = (await readdir(dir, { recursive: true })).map((f) => f.replaceAll("\\", "/")).sort()
  for (const file of files) {
    const notFound = file === NOT_FOUND || file.endsWith(`/${NOT_FOUND}`)
    const path = notFound ? null : pagePath(file)
    if (!notFound && path === null) continue
    const html = await readFile(new URL(file, dir), "utf-8")
    const url = `${options.site}${path ?? `${base}/`}`
    const target = notFound ? file.replace(/\.html$/, ".md") : markdownFile(path!, base)
    await writeFile(new URL(target, dir), pageFrontmatter(html, url) + htmlToMarkdown(html, url) + footer)
    if (path !== null) pages.push({ path, file: target })
  }
  return pages
}

/** Alternances `a|b|c` de moins de `MAX_PATTERN` caractères. */
function chunks(items: string[]): string[] {
  const out: string[] = []
  let current: string[] = []
  for (const item of items) {
    if (current.length && [...current, item].join("|").length > MAX_PATTERN) {
      out.push(current.join("|"))
      current = []
    }
    current.push(item)
  }
  if (current.length) out.push(current.join("|"))
  return out
}

/**
 * Routes à placer avant `{ handle: "filesystem" }` (`before`) et juste avant la page 404 de l'adaptateur
 * (`miss`) : Markdown servi sur `Accept: text/markdown` avec `Vary: Accept` et l'adresse canonique en `Link`,
 * `Vary: Accept` sur le HTML des mêmes pages, `404.md` (statut 404) pour une adresse inconnue.
 */
export function markdownRoutes(
  pages: MarkdownPage[],
  options: Pick<MarkdownBuildOptions, "site" | "base">,
): { before: Route[]; miss: Route[] } {
  const base = options.base ?? ""
  const canonical = (path: string) => `<${options.site}${path}>; rel="canonical"`
  const before: Route[] = []

  // Pages dont le fichier ne suit pas `<chemin>.md` (racine, préfixe) : une route chacune.
  const special = pages.filter((p) => p.file !== `${p.path.slice(1)}.md`)
  const regular = pages.filter((p) => p.file === `${p.path.slice(1)}.md`)

  // L'accueil d'un préfixe arrive aussi avec la barre finale : `/agence/`, forme que relaie le site parent.
  const pattern = (path: string) => (base && path === base ? `${escapeRegex(path)}/?` : escapeRegex(path))

  for (const group of chunks(pages.map((p) => pattern(p.path))))
    before.push({ src: `^(?:${group})$`, headers: { Vary: VARY }, continue: true })
  for (const page of special) {
    const src = `^${pattern(page.path)}$`
    const link = canonical(page.path === "/" ? "/" : page.path)
    before.push({
      src,
      has: [ACCEPTS_MARKDOWN],
      dest: `/${page.file}`,
      headers: { "Content-Type": MARKDOWN_TYPE, Vary: VARY, Link: link },
    })
    before.push({ src: `^/${escapeRegex(page.file)}$`, headers: { Link: link }, continue: true })
  }
  for (const group of chunks(regular.map((p) => escapeRegex(p.path.slice(1))))) {
    const link = `<${options.site}/$1>; rel="canonical"`
    before.push({
      src: `^/(${group})$`,
      has: [ACCEPTS_MARKDOWN],
      dest: "/$1.md",
      headers: { "Content-Type": MARKDOWN_TYPE, Vary: VARY, Link: link },
    })
    // Lue directement (/contact.md), la version Markdown renvoie à la page HTML de référence.
    before.push({ src: `^/(${group})\\.md$`, headers: { Link: link }, continue: true })
  }

  const scope = base ? `^${escapeRegex(base)}(?:/.*)?$` : "^/.*$"
  const miss: Route[] = [
    {
      src: scope,
      has: [ACCEPTS_MARKDOWN],
      dest: `${base}/404.md`,
      status: 404,
      headers: { "Content-Type": MARKDOWN_TYPE, Vary: VARY },
    },
  ]
  return { before: forEveryAgent(before), miss: forEveryAgent(miss) }
}

// `has` est un ET : une route Markdown devient une route par façon de demander le Markdown.
function forEveryAgent(routes: Route[]): Route[] {
  return routes.flatMap((route) =>
    route.has?.[0] === ACCEPTS_MARKDOWN ? WANTS_MARKDOWN.map((condition) => ({ ...route, has: [condition] })) : [route],
  )
}
