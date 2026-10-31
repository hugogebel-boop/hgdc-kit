import GithubSlugger from "github-slugger"

/**
 * Découpe une page en passages pour la recherche de l'assistant : une section par titre
 * (`##` à `######`), coupée en paragraphes si elle dépasse `MAX_CHARS`. Chaque passage
 * garde l'ancre de son titre, calculée comme les identifiants de Starlight (github-slugger),
 * pour que la source citée ouvre la bonne section.
 */
export const MAX_CHARS = 1600
const MIN_CHARS = 120

export type Chunk = {
  /** Fil des titres, page comprise : « Publier › Avec Host ». */
  heading: string
  anchor: string | null
  text: string
}

type Section = { trail: Array<string>; anchor: string | null; lines: Array<string> }

/** Au-delà, une ligne n'est pas un titre : la borne garde l'analyse linéaire. */
const MAX_HEADING_LINE = 500

/**
 * Titre ATX (`## Titre`, fermeture `##` facultative), lu caractère par caractère : pas
 * d'expression régulière à quantificateurs chevauchants, donc pas de retour arrière
 * explosif sur une ligne piégée (« ## a » suivi de milliers d'espaces).
 */
export function parseHeading(line: string): { level: number; text: string } | null {
  if (line.length > MAX_HEADING_LINE || !line.startsWith("#")) return null
  let level = 0
  while (line[level] === "#") level++
  if (level > 6 || (line[level] !== " " && line[level] !== "\t")) return null
  let text = line.slice(level).trim()
  let end = text.length
  while (end > 0 && text[end - 1] === "#") end--
  if (end < text.length && (end === 0 || text[end - 1] === " " || text[end - 1] === "\t"))
    text = text.slice(0, end).trim()
  return text ? { level, text } : null
}
const FENCE = /^\s*(```|~~~)/

export function chunkPage(title: string, markdown: string): Array<Chunk> {
  const slugger = new GithubSlugger()
  const sections: Array<Section> = [{ trail: [], anchor: null, lines: [] }]
  const stack: Array<{ level: number; text: string }> = []
  let fence: string | null = null

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) fence = fence === null ? fenceMatch[1]! : fence === fenceMatch[1] ? null : fence
    const heading = fence === null && !fenceMatch ? parseHeading(line) : null
    if (!heading) {
      sections.at(-1)!.lines.push(line)
      continue
    }
    const level = heading.level
    const text = stripInline(heading.text)
    if (level === 1) continue // le titre de la page, déjà porté par `title`
    while (stack.length && stack.at(-1)!.level >= level) stack.pop()
    stack.push({ level, text })
    sections.push({ trail: stack.map((s) => s.text), anchor: slugger.slug(text), lines: [] })
  }

  const chunks: Array<Chunk> = []
  for (const section of sections) {
    const body = section.lines.join("\n").trim()
    if (!body) continue
    const heading = [title, ...section.trail].join(" › ")
    for (const part of splitBody(body)) chunks.push({ heading, anchor: section.anchor, text: part })
  }
  return mergeSmall(chunks)
}

/** Paragraphes regroupés jusqu'à `MAX_CHARS`, sans couper un bloc de code. */
function splitBody(body: string): Array<string> {
  if (body.length <= MAX_CHARS) return [body]
  const blocks: Array<string> = []
  let current: Array<string> = []
  let fence = false
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) fence = !fence
    if (!fence && line.trim() === "" && current.length) {
      blocks.push(current.join("\n"))
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) blocks.push(current.join("\n"))

  const parts: Array<string> = []
  let buffer = ""
  for (const block of blocks) {
    if (buffer && buffer.length + block.length + 2 > MAX_CHARS) {
      parts.push(buffer)
      buffer = ""
    }
    buffer = buffer ? `${buffer}\n\n${block}` : block
    while (buffer.length > MAX_CHARS * 2) {
      parts.push(buffer.slice(0, MAX_CHARS))
      buffer = buffer.slice(MAX_CHARS)
    }
  }
  if (buffer) parts.push(buffer)
  return parts
}

/** Un passage très court rejoint le suivant de la même section : seul, il ne répond à rien. */
function mergeSmall(chunks: Array<Chunk>): Array<Chunk> {
  const merged: Array<Chunk> = []
  for (const chunk of chunks) {
    const previous = merged.at(-1)
    if (previous && previous.text.length < MIN_CHARS && previous.anchor === chunk.anchor) {
      previous.text = `${previous.text}\n\n${chunk.text}`
      continue
    }
    merged.push({ ...chunk })
  }
  return merged
}

function stripInline(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_]/g, "")
    .trim()
}

/** Texte envoyé au modèle d'embeddings : le contexte du titre aide à retrouver un passage court. */
export function embeddingText(chunk: Chunk): string {
  return `${chunk.heading}\n\n${chunk.text}`
}
