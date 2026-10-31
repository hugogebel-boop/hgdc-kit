import type { NavItem, NavTree } from "./navigation.ts"
import { pagesOf as pagesIn, pageToPath, withBase } from "./navigation.ts"

/**
 * `llms.txt` et `llms-full.txt` au format de llmstxt.org : un H1, un résumé en citation,
 * puis une section H2 par onglet (ou groupe), chaque page liée à sa version Markdown.
 * Les versions autres que celle par défaut vont sous « Optional », que l'agent peut sauter.
 */
export type LlmsPage = { page: string; title: string; description: string | null; markdown: string }

export type LlmsInput = {
  name: string
  description: string | null
  site: string | null
  /** Sous-chemin du site (`/docs`), `""` ou absent à la racine. */
  base?: string
  tree: NavTree
  pages: ReadonlyMap<string, LlmsPage>
}

/** `/guides/publier/` → `/guides/publier.md`, `/` → `/index.md`. */
export function markdownPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "")
  return trimmed ? `${trimmed}.md` : "/index.md"
}

function url(input: Pick<LlmsInput, "site" | "base">, path: string): string {
  const full = withBase(input.base ?? "", path)
  return input.site ? new URL(full, input.site).toString() : full
}

function link(input: LlmsInput, page: string): string | null {
  const data = input.pages.get(page)
  if (!data) return null
  const target = url(input, markdownPath(pageToPath(page)))
  return `- [${data.title}](${target})${data.description ? `: ${data.description}` : ""}`
}

function sectionLines(input: LlmsInput, heading: string, items: Array<NavItem>): Array<string> {
  const lines: Array<string> = []
  const loose: Array<string> = []
  const groups: Array<[string, Array<string>]> = []
  const walk = (list: Array<NavItem>, prefix: string | null, into: Array<string>) => {
    for (const item of list) {
      if (item.type === "page") {
        const line = link(input, item.page)
        if (line) into.push(line)
      } else {
        const label = prefix ? `${prefix} › ${item.label}` : item.label
        const bucket: Array<string> = []
        groups.push([label, bucket])
        walk(item.items, label, bucket)
      }
    }
  }
  walk(items, null, loose)
  if (loose.length) lines.push(`## ${heading}`, "", ...loose, "")
  for (const [label, bucket] of groups) {
    if (!bucket.length) continue
    lines.push(`## ${heading === "Documentation" ? label : `${heading} · ${label}`}`, "", ...bucket, "")
  }
  return lines
}

export function llmsTxt(input: LlmsInput): string {
  const lines = [`# ${input.name}`, ""]
  if (input.description) lines.push(`> ${input.description}`, "")
  lines.push(
    "Chaque page existe en Markdown à la même adresse suivie de `.md`. `llms-full.txt` contient toute la documentation en un seul fichier.",
    "",
  )
  const optional: Array<string> = []
  for (const version of input.tree.versions) {
    for (const tab of version.tabs) {
      if (version.isDefault) {
        lines.push(...sectionLines(input, tab.label ?? "Documentation", tab.items))
        continue
      }
      // Anciennes versions : une liste plate sous « Optional », libellée par version.
      for (const page of pagesIn(tab.items)) {
        const line = link(input, page)
        if (line) optional.push(line.replace("- [", `- [${version.label} · `))
      }
    }
  }
  if (optional.length) lines.push("## Optional", "", ...optional, "")
  return `${lines.join("\n").trim()}\n`
}

export function llmsFullTxt(input: LlmsInput, order: Array<string>): string {
  const parts = [`# ${input.name}`, input.description ? `\n> ${input.description}` : ""]
  for (const page of order) {
    const data = input.pages.get(page)
    if (!data) continue
    parts.push(`\n---\n\nSource : ${url(input, pageToPath(page))}\n\n# ${data.title}\n\n${data.markdown.trim()}`)
  }
  return `${parts.join("\n").trim()}\n`
}
