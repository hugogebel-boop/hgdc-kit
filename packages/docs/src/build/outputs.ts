import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { select } from "hast-util-select"
import { toString } from "hast-util-to-string"
import rehypeParse from "rehype-parse"
import { unified } from "unified"

import type { DocsConfig } from "../core/config.ts"
import { CORPUS_FORMAT, CORPUS_PATH, MAX_PAGE_CHARS, type Corpus } from "../core/corpus.ts"
import { llmsFullTxt, llmsTxt, markdownPath, type LlmsPage } from "../core/llms.ts"
import { allPages, locatePage, pageToPath, withBase, type NavTree } from "../core/navigation.ts"
import { htmlToMarkdown } from "./markdown.ts"

type Input = {
  outDir: string
  pathnames: Array<string>
  config: DocsConfig
  tree: NavTree
  site: string | null
  /** Sous-chemin du site (`/docs`) : porté par les chemins publiés, pas par les fichiers écrits ici. */
  base?: string
}

/** `guides/publier/` (pathname d'Astro) → `/guides/publier/`. */
const normalize = (pathname: string) => `/${pathname}`.replace(/\/+/g, "/").replace(/([^/])$/, "$1/")

/**
 * Après le build : une version Markdown de chaque page, `llms.txt`, `llms-full.txt`
 * (aussi sous `/.well-known/`) et le corpus de l'assistant. Seules les pages de la
 * navigation y entrent : une page hors navigation n'est pas annoncée aux agents.
 */
export async function writeMachineReadable(input: Input): Promise<{ pages: number }> {
  const base = input.base ?? ""
  const byPath = new Map(allPages(input.tree).map((page) => [pageToPath(page), page]))
  const pages = new Map<string, LlmsPage>()
  const corpusPages: Corpus["pages"] = []

  for (const pathname of input.pathnames) {
    const path = normalize(pathname)
    const page = byPath.get(path)
    const htmlFile = join(input.outDir, path, "index.html")
    if (!page || !existsSync(htmlFile)) continue
    const html = await readFile(htmlFile, "utf8")
    const tree = unified().use(rehypeParse).parse(html)
    const heading = select("h1#_top", tree) ?? select("title", tree)
    const title = heading ? toString(heading as Parameters<typeof toString>[0]).trim() : path
    const description = select('meta[name="description"]', tree)?.properties["content"]
    const markdown = htmlToMarkdown(html).slice(0, MAX_PAGE_CHARS)
    // Starlight reprend la description du site quand la page n'en a pas : ce n'est pas la sienne.
    const own = typeof description === "string" && description !== input.config.description ? description : null
    const entry = { page, title, description: own, markdown }
    pages.set(page, entry)
    await write(input.outDir, markdownPath(path), `# ${title}\n\n${markdown}\n`)
    corpusPages.push({
      path: withBase(base, path),
      title,
      description: entry.description,
      version: locatePage(input.tree, page)?.version.id ?? null,
      markdown,
    })
  }

  const llms = {
    name: input.config.name,
    description: input.config.description ?? null,
    site: input.site,
    base,
    tree: input.tree,
    pages,
  }
  const index = llmsTxt(llms)
  const full = llmsFullTxt(llms, [...new Set(allPages(input.tree))])
  await write(input.outDir, "/llms.txt", index)
  await write(input.outDir, "/.well-known/llms.txt", index)
  await write(input.outDir, "/llms-full.txt", full)

  const logo = input.config.logo
  const corpus: Corpus = {
    format: CORPUS_FORMAT,
    project: input.config.project ?? null,
    name: input.config.name,
    language: input.config.language,
    builtAt: new Date().toISOString(),
    theme: {
      primary: input.config.colors?.primary ?? null,
      logo: withLogoBase(base, typeof logo === "string" ? logo : (logo?.light ?? null)),
    },
    versions: input.tree.versions.map(({ id, label, isDefault }) => ({ id, label, isDefault })),
    pages: corpusPages,
  }
  await write(input.outDir, CORPUS_PATH, JSON.stringify(corpus))
  return { pages: pages.size }
}

const withLogoBase = (base: string, logo: string | null) =>
  logo ? withBase(base, logo.startsWith("/") || logo.includes("://") ? logo : `/${logo}`) : null

async function write(outDir: string, path: string, content: string): Promise<void> {
  const target = join(outDir, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}
