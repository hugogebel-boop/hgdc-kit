/**
 * Markdown restreint des réponses de l'assistant → arbre de nœuds, rendu ensuite en DOM
 * avec `textContent` seulement : aucun HTML de la réponse n'est jamais interprété. Une
 * réponse du modèle reste une donnée non fiable, même quand elle cite la doc.
 */
export type Inline =
  | { type: "text"; value: string }
  | { type: "strong" | "em"; children: Array<Inline> }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Array<Inline> }
  | { type: "ref"; n: number }

export type Block =
  | { type: "paragraph"; children: Array<Inline> }
  | { type: "heading"; children: Array<Inline> }
  | { type: "list"; ordered: boolean; items: Array<Array<Inline>> }
  | { type: "code"; language: string | null; value: string }

/**
 * Liens permis : chemins du site, ancres, et adresses des origines données (le site de la
 * doc). Un lien vers ailleurs, même en https, devient du texte : une page injectée ne peut
 * pas faire afficher un lien de hameçonnage par l'assistant.
 */
export function safeHref(href: string, origins: ReadonlyArray<string> = []): string | null {
  const value = href.trim()
  if (value.startsWith("#")) return value
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value
  try {
    const url = new URL(value)
    const web = url.protocol === "https:" || url.protocol === "http:"
    return web && origins.includes(url.origin) ? url.toString() : null
  } catch {
    return null
  }
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[\^(\d+)\])|(\[([^\]]+)\]\(([^)\s]+)\))/

export function parseInline(source: string, origins: ReadonlyArray<string> = []): Array<Inline> {
  const out: Array<Inline> = []
  let rest = source
  while (rest) {
    const match = INLINE.exec(rest)
    if (!match) {
      out.push({ type: "text", value: rest })
      break
    }
    if (match.index > 0) out.push({ type: "text", value: rest.slice(0, match.index) })
    const [whole, code, strong, em, ref, refN, link, linkText, linkHref] = match
    if (code) out.push({ type: "code", value: code.slice(1, -1) })
    else if (strong) out.push({ type: "strong", children: parseInline(strong.slice(2, -2), origins) })
    else if (em) out.push({ type: "em", children: parseInline(em.slice(1, -1), origins) })
    else if (ref && refN) out.push({ type: "ref", n: Number(refN) })
    else if (link && linkText && linkHref) {
      const href = safeHref(linkHref, origins)
      out.push(
        href ? { type: "link", href, children: parseInline(linkText, origins) } : { type: "text", value: linkText },
      )
    }
    rest = rest.slice(match.index + whole.length)
  }
  return out
}

const LIST = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/

export function parseMarkdown(source: string, origins: ReadonlyArray<string> = []): Array<Block> {
  const blocks: Array<Block> = []
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  let paragraph: Array<string> = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" "), origins) })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line)
    if (fence) {
      flush()
      const body: Array<string> = []
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) body.push(lines[i]!)
      blocks.push({ type: "code", language: fence[1] || null, value: body.join("\n") })
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: "heading", children: parseInline(heading[1]!, origins) })
      continue
    }
    const item = LIST.exec(line)
    if (item) {
      flush()
      const ordered = Boolean(item[2])
      const previous = blocks.at(-1)
      const list =
        previous?.type === "list" && previous.ordered === ordered && lines[i - 1]?.trim() !== ""
          ? previous
          : (blocks[blocks.push({ type: "list", ordered, items: [] }) - 1] as Extract<Block, { type: "list" }>)
      list.items.push(parseInline(item[3]!, origins))
      continue
    }
    if (line.trim() === "") flush()
    else paragraph.push(line.trim())
  }
  flush()
  return blocks
}
