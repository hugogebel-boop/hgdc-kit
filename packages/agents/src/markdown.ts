// HTML → Markdown pour les agents. Prévu pour le HTML qu'un produit rend lui-même (Astro, React SSR),
// bien formé et sans contenu tiers : pas de dépendance, seulement les éléments qu'un site de la
// famille emploie. Ce qui est caché aux lecteurs d'écran (aria-hidden, visually-hidden, hidden)
// l'est aussi aux agents.

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
])
const DROPPED = new Set([
  "script",
  "style",
  "svg",
  "template",
  "noscript",
  "button",
  "form",
  "input",
  "select",
  "textarea",
  "dialog",
])
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "cite",
  "code",
  "em",
  "i",
  "img",
  "kbd",
  "label",
  "mark",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
])
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

type Element = { tag: string; attrs: Record<string, string>; children: Node[] }
type Node = Element | string
type Link = (href: string) => string | null

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole
    const code =
      name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10)
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
    attrs[m[1]!.toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "")
  return attrs
}

/** Arbre minimal d'un fragment HTML. */
function parse(html: string): Element {
  const root: Element = { tag: "#root", attrs: {}, children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]!
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, "")
  let last = 0
  for (const m of cleaned.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const text = cleaned.slice(last, m.index)
    if (text) top().children.push(decode(text))
    last = m.index + m[0].length
    const tag = m[2]!.toLowerCase()
    if (m[1]) {
      // Fermeture : remonte jusqu'à l'élément ouvert correspondant (tolère un oubli).
      const at = stack.findLastIndex((el) => el.tag === tag)
      if (at > 0) stack.length = at
      continue
    }
    const el: Element = { tag, attrs: parseAttrs(m[3]!), children: [] }
    top().children.push(el)
    if (!VOID.has(tag) && !m[3]!.trimEnd().endsWith("/")) stack.push(el)
  }
  const tail = cleaned.slice(last)
  if (tail) top().children.push(decode(tail))
  return root
}

const hasClass = (el: Element, pattern: RegExp) => pattern.test(el.attrs.class ?? "")
const hidden = (el: Element) =>
  DROPPED.has(el.tag) ||
  el.attrs["aria-hidden"] === "true" ||
  "hidden" in el.attrs ||
  // `hidden` seul est la classe Tailwind `display: none` : l'autre moitié d'une image claire/sombre
  // (`hidden dark:block`). `dark:hidden` ou `sm:hidden` ne comptent pas.
  hasClass(el, /(?:^|\s)(?:visually-hidden|sr-only|skip-link|hidden)(?:\s|$)/)

const hasBlock = (node: Node): boolean =>
  typeof node !== "string" && !hidden(node) && (!INLINE.has(node.tag) || node.children.some(hasBlock))

// Espaces ordinaires seulement : U+00A0 et U+202F (espace fine) sont des choix typographiques.
const collapse = (text: string) => text.replace(/[ \t\n\r\f]+/g, " ")
const escape = (text: string) => text.replace(/([\\*_`[\]])/g, "\\$1")

function inline(nodes: Node[], link: Link): string {
  let out = ""
  let afterElement = false
  for (const node of nodes) {
    if (typeof node === "string") {
      out += escape(collapse(node))
      afterElement = false
      continue
    }
    if (hidden(node)) continue
    // Deux éléments collés (boutons, badges côte à côte) : séparés par une espace, comme à l'écran.
    if (afterElement && node.tag !== "br" && out && !/\s$/.test(out)) out += " "
    afterElement = true
    const inner = () => inline(node.children, link)
    switch (node.tag) {
      case "br":
        // Saut de ligne forcé de CommonMark : barre oblique inverse en fin de ligne.
        out += "\\\n"
        break
      case "strong":
      case "b": {
        const text = inner().trim()
        if (text) out += `**${text}**`
        break
      }
      case "em":
      case "i": {
        const text = inner().trim()
        if (text) out += `_${text}_`
        break
      }
      case "code":
        out += `\`${inner().replace(/\\([\\*_`[\]])/g, "$1")}\``
        break
      case "img":
        // L'image en double pour le thème sombre (only-dark) ne se lit qu'une fois.
        if (node.attrs.alt && !hasClass(node, /(?:^|\s)only-dark(?:\s|$)/)) out += escape(node.attrs.alt)
        break
      case "a": {
        const text = inner().trim()
        const href = node.attrs.href ? link(node.attrs.href) : null
        out += href && text ? `[${text}](${href})` : text
        break
      }
      default:
        out += inner()
    }
  }
  return out
}

/** Bloc de texte propre : espaces fusionnés, bords retirés, sauts de ligne forcés gardés. */
const tidy = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .trim()
    .replace(/\\$/, "")

function blocks(el: Element, link: Link): string[] {
  const out: string[] = []
  let run: Node[] = []
  const flush = () => {
    const text = tidy(inline(run, link))
    if (text) out.push(text)
    run = []
  }
  for (const node of el.children) {
    if (!hasBlock(node)) {
      run.push(node)
      continue
    }
    flush()
    out.push(...block(node as Element, link))
  }
  flush()
  return out
}

function block(el: Element, link: Link): string[] {
  const text = () => tidy(inline(el.children, link)).replace(/\n/g, " ")
  const heading = /^h([1-6])$/.exec(el.tag)
  if (heading) {
    const t = text()
    return t ? [`${"#".repeat(Number(heading[1]))} ${t}`] : []
  }
  switch (el.tag) {
    case "hr":
      return ["---"]
    case "ul":
    case "ol": {
      const items = el.children.filter((c): c is Element => typeof c !== "string" && c.tag === "li" && !hidden(c))
      const lines = items.map((li, i) => {
        const marker = el.tag === "ol" ? `${i + 1}. ` : "- "
        const body = blocks(li, link).join("\n\n")
        return marker + body.replace(/\n(?!\n)/g, `\n${" ".repeat(marker.length)}`)
      })
      return lines.length ? [lines.join("\n")] : []
    }
    case "blockquote":
      return blocks(el, link).map((b) => b.replace(/^/gm, "> "))
    case "dt":
    case "summary": {
      const t = text()
      return t ? [`**${t}**`] : []
    }
    case "a": {
      // Lien qui enveloppe des blocs (carte) : le contenu, puis le lien seul.
      const href = el.attrs.href ? link(el.attrs.href) : null
      const inner = blocks(el, link)
      return href ? [...inner, `[${inner[0]?.replace(/^#+ /, "") ?? href}](${href})`] : inner
    }
    default:
      return blocks(el, link)
  }
}

/** Contenu de la page : le premier `<main>`, sinon le `<body>`, sinon tout le fragment. */
function pageContent(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)
  if (main) return main[1]!
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  return body ? body[1]! : html
}

/** Titre de la page (`<title>`), pour une page dont le contenu n'a pas de titre de niveau 1. */
export function pageTitle(html: string): string | null {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return title ? collapse(decode(title[1]!)).trim() || null : null
}

/**
 * Markdown du contenu d'une page HTML.
 * @param base adresse de la page, pour rendre les liens absolus
 */
const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
    .exec(tag)
    ?.slice(1)
    .find((v) => v !== undefined)

/** Première balise `<tag …>` du document dont un attribut vaut `value`, avec son attribut `read`. */
function headValue(html: string, tag: string, key: string, value: string, read: string): string | null {
  for (const m of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))) {
    if (attribute(m[0], key)?.toLowerCase() === value) {
      const found = attribute(m[0], read)
      if (found) return collapse(decode(found)).trim()
    }
  }
  return null
}

/**
 * Bloc de métadonnées YAML qui ouvre le Markdown d'une page : titre, description et adresse canonique, lus
 * dans le `<head>` (`url` à défaut de `<link rel="canonical">`, sinon pas d'adresse). Les valeurs sont des
 * chaînes JSON, du YAML valide quel que soit leur contenu.
 */
export function pageFrontmatter(html: string, url?: string | URL): string {
  const fields: [string, string | null][] = [
    ["title", pageTitle(html)],
    ["description", headValue(html, "meta", "name", "description", "content")],
    ["canonical", headValue(html, "link", "rel", "canonical", "href") ?? (url ? new URL(url).href : null)],
  ]
  const lines = fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n` : ""
}

export function htmlToMarkdown(html: string, base: string | URL): string {
  const page = new URL(base)
  const link: Link = (href) => {
    if (href.startsWith("#")) return null
    if (/^(?:mailto|tel):/i.test(href)) return href
    try {
      const url = new URL(href, page)
      return /^https?:$/.test(url.protocol) ? url.href : null
    } catch {
      return null
    }
  }
  const out = blocks(parse(pageContent(html)), link)
  if (!out.some((b) => b.startsWith("# "))) {
    const title = pageTitle(html)
    if (title) out.unshift(`# ${escape(title)}`)
  }
  return `${out.join("\n\n")}\n`
}
