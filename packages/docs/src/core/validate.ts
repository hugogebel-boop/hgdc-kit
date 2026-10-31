import { compile } from "@mdx-js/mdx"
import type { Root } from "mdast"
import remarkGfm from "remark-gfm"
import { parse as parseYaml } from "yaml"

import { isMdxComponent } from "./components.ts"
import { parseDocsConfig } from "./config.ts"
import { missingPages, normalizeNavigation, pageToSlug } from "./navigation.ts"

/**
 * Ce que le build refuserait, vérifié avant de publier : l'éditeur de la console bloque
 * la publication sur la moindre erreur, avec la ligne à corriger. Même compilateur MDX
 * que le build (`@mdx-js/mdx`, GFM), même schéma de `docs.json`, même règle de pages.
 */
export type Problem = { file: string; line: number | null; column: number | null; message: string }

/** Une page de la doc : `.mdx` ou `.md` à l'intérieur du dossier. */
export const PAGE_FILE = /\.(mdx|md)$/i

const IMAGE_FILE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i

/**
 * Fichier que l'éditeur peut écrire, relatif au dossier de la doc : `docs.json`, pages et
 * images. Jamais un dossier caché ni la configuration du build (même règle que Host,
 * `isEditablePath` d'agenthost, qui revérifie).
 */
export function isDocFile(path: string): boolean {
  if (path.length === 0 || path.length > 300) return false
  if (path.startsWith("/") || path.endsWith("/") || path.includes("\\")) return false
  const segments = path.split("/")
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) return false
  if (segments.includes("node_modules") || segments[0] === "dist") return false
  if (!/^[\p{L}\p{N} ._/()+@-]+$/u.test(path)) return false
  return path === "docs.json" || PAGE_FILE.test(path) || IMAGE_FILE.test(path)
}

export function isImageFile(path: string): boolean {
  return IMAGE_FILE.test(path)
}

/** Fichiers Markdown du dossier qui ne sont pas des pages (`template/src/content.config.ts`). */
const NOT_PAGES = new Set(["README.md", "CHANGELOG.md"])

/**
 * Une page du site : `.mdx` ou `.md`, sauf un extrait (`_nom.mdx`, inclus par d'autres pages)
 * et le README ou le CHANGELOG à la racine, que le build ignore.
 */
export function isPageFile(file: string): boolean {
  return PAGE_FILE.test(file) && !NOT_PAGES.has(file) && !(file.split("/").at(-1) ?? "").startsWith("_")
}

/** `guides/publier.mdx` → `guides/publier` : le chemin de page de `docs.json` ; `null` pour un autre fichier. */
export function pageOfFile(file: string): string | null {
  return isPageFile(file) ? file.replace(PAGE_FILE, "") : null
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/

export type Frontmatter = { raw: string | null; body: string; lines: number }

/** En-tête YAML d'une page et corps, avec le nombre de lignes de l'en-tête (pour garder les numéros de ligne). */
export function splitFrontmatter(source: string): Frontmatter {
  const match = FRONTMATTER.exec(source)
  if (!match) return { raw: null, body: source, lines: 0 }
  const header = match[0]
  const lines = header.split("\n").length - (header.endsWith("\n") ? 1 : 0)
  return { raw: match[1] ?? "", body: source.slice(header.length), lines }
}

/** Lit l'en-tête d'une page : objet YAML, ou `null` s'il manque ou ne se lit pas. */
export function readFrontmatter(source: string): Record<string, unknown> | null {
  const { raw } = splitFrontmatter(source)
  if (raw === null) return null
  try {
    const data: unknown = parseYaml(raw)
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

type Position = { start?: { line?: number; column?: number } }
type MdxNode = { type: string; name?: string | null; position?: Position; children?: Array<MdxNode> }

/** Composants appelés par la page sans exister : le build échouerait au rendu. */
function unknownComponents(problems: Array<Problem>, file: string) {
  return () => (tree: Root) => {
    const declared = new Set<string>()
    const walk = (node: MdxNode) => {
      if (node.type === "mdxjsEsm") {
        const value = (node as unknown as { value: string }).value
        for (const match of value.matchAll(/import\s+(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))/g)) {
          for (const name of (match[1] ?? match[2] ?? "").split(","))
            declared.add(
              name
                .split(/\s+as\s+/)
                .pop()!
                .trim(),
            )
        }
        for (const match of value.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g)) declared.add(match[1]!)
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree as unknown as MdxNode)
    const check = (node: MdxNode) => {
      if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name) {
        const root = node.name.split(".")[0]!
        if (/^[A-Z]/.test(root) && !isMdxComponent(root) && !declared.has(root))
          problems.push({
            file,
            line: node.position?.start?.line ?? null,
            column: node.position?.start?.column ?? null,
            message: `Le composant <${node.name}> n'existe pas. Composants disponibles : <Note>, <Tip>, <Card>, <Steps>…`,
          })
      }
      for (const child of node.children ?? []) check(child)
    }
    check(tree as unknown as MdxNode)
  }
}

const TRANSLATIONS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/Expected a closing tag for `<([^>]+)>`/, (m) => `La balise <${m[1]}> n'est jamais fermée.`],
  [
    /Unexpected closing slash `\/` in tag, expected an open tag first/,
    () => "Balise fermante sans balise ouvrante correspondante.",
  ],
  [
    /Unexpected closing tag `<\/([^>]+)>`, expected corresponding closing tag for `<([^>]+)>`/,
    (m) => `</${m[1]}> ferme la mauvaise balise : <${m[2]}> est encore ouverte.`,
  ],
  [
    /Expected the closing tag `<\/([^>]+)>` either after the end of/,
    (m) =>
      `</${m[1]}> est mal placée : ouvre et ferme <${m[1]}> sur leurs propres lignes, ou sur la même ligne que le texte.`,
  ],
  [
    /Could not parse expression with acorn/,
    () => "Expression entre accolades illisible : échappe « { » par « \\{ » si c'est du texte.",
  ],
  [/Could not parse import\/exports with acorn/, () => "Ligne import ou export illisible."],
  [
    /Unexpected end of file in expression, expected a corresponding closing brace for `\{`/,
    () => "Accolade « { » jamais fermée : échappe-la par « \\{ » si c'est du texte.",
  ],
  [
    /Unexpected character `(.)` \(U\+[0-9A-F]+\) before name/,
    (m) => `Caractère « ${m[1]} » inattendu après « < » : écris « &lt; » pour un chevron dans le texte.`,
  ],
  [/Unexpected lazy line in/, () => "Ligne mal indentée à l'intérieur d'un bloc (citation, liste ou composant)."],
]

function translate(reason: string): string {
  for (const [pattern, render] of TRANSLATIONS) {
    const match = reason.match(pattern)
    if (match) return render(match)
  }
  return `Syntaxe MDX invalide : ${reason}`
}

type Point = { line?: number; column?: number }
type VFileMessageLike = {
  reason?: string
  message?: string
  line?: number | null
  column?: number | null
  place?: (Point & { start?: Point }) | null
}

/** Position d'une erreur de MDX : son point, sinon celui cité dans le message (`(7:1-7:7)`). */
function positionOf(failure: VFileMessageLike, reason: string): { line: number | null; column: number | null } {
  const point = failure.place?.start ?? failure.place
  if (failure.line) return { line: failure.line, column: failure.column ?? null }
  if (point?.line) return { line: point.line, column: point.column ?? null }
  const cited = reason.match(/\((\d+):(\d+)/)
  return cited ? { line: Number(cited[1]), column: Number(cited[2]) } : { line: null, column: null }
}

/** En-tête lu ; `undefined` (et une erreur notée) s'il ne se lit pas. */
function checkYaml(problems: Array<Problem>, file: string, raw: string): unknown {
  try {
    return parseYaml(raw)
  } catch (error) {
    const position = (error as { linePos?: Array<{ line: number; col: number }> }).linePos?.[0]
    problems.push({
      file,
      line: position ? position.line + 1 : 1,
      column: position?.col ?? null,
      message: "En-tête illisible : vérifie les deux-points et les guillemets (YAML).",
    })
    return undefined
  }
}

/**
 * Vérifie une page : en-tête YAML avec un `title` (Starlight l'exige), compilation MDX
 * comme au build, composants connus. Les numéros de ligne sont ceux du fichier entier.
 */
export async function checkPage(file: string, source: string): Promise<Array<Problem>> {
  const problems: Array<Problem> = []
  const front = splitFrontmatter(source)
  // Un extrait ou le README n'est pas une page : seule la syntaxe compte, pas l'en-tête.
  if (!isPageFile(file)) {
    if (front.raw !== null) checkYaml(problems, file, front.raw)
  } else if (front.raw === null) {
    problems.push({
      file,
      line: 1,
      column: 1,
      message: "Il manque l'en-tête de la page : commence par ---, title: Le titre, puis ---.",
    })
  } else {
    const data = checkYaml(problems, file, front.raw)
    const title = data && typeof data === "object" ? (data as Record<string, unknown>).title : undefined
    if (data !== undefined && (typeof title !== "string" || !title.trim()))
      problems.push({
        file,
        line: 2,
        column: 1,
        message: "L'en-tête doit donner un titre : title: Le titre de la page.",
      })
  }

  // Les lignes de l'en-tête restent, vides : les positions de MDX tombent sur la bonne ligne.
  const body = "\n".repeat(front.lines) + front.body
  try {
    await compile(body, {
      format: file.toLowerCase().endsWith(".md") ? "md" : "mdx",
      remarkPlugins: [remarkGfm, unknownComponents(problems, file)],
    })
  } catch (error) {
    const failure = error as VFileMessageLike
    const reason = String(failure.reason ?? failure.message ?? error)
    problems.push({ file, ...positionOf(failure, reason), message: translate(reason) })
  }
  return problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
}

/**
 * Vérifie `docs.json` et sa navigation contre les fichiers de la doc : schéma, une seule
 * forme de navigation, et chaque page citée présente dans le dossier.
 */
export function checkSite(docsJson: string, files: Iterable<string>): Array<Problem> {
  const parsed = parseDocsConfig(docsJson)
  if (!parsed.ok) return parsed.errors.map((message) => ({ file: "docs.json", line: null, column: null, message }))
  const existing = new Set<string>()
  for (const file of files) {
    const page = pageOfFile(file)
    if (page) existing.add(pageToSlug(page))
  }
  const problems: Array<Problem> = missingPages(normalizeNavigation(parsed.config), existing).map((page) => ({
    file: "docs.json",
    line: null,
    column: null,
    message: `La navigation cite la page ${page}, mais ${page}.mdx n'existe pas.`,
  }))
  const slug = (path: string) =>
    path
      .split(/[?#]/)[0]!
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase()
  const sources = new Set<string>()
  for (const redirect of parsed.config.redirects ?? []) {
    const source = slug(redirect.source)
    const say = (message: string) => problems.push({ file: "docs.json", line: null, column: null, message })
    if (sources.has(source)) say(`Deux redirections partent de ${redirect.source}.`)
    sources.add(source)
    // Une redirection depuis une page qui existe la cacherait : le build écrirait les deux au même endroit.
    if (existing.has(source))
      say(`La redirection ${redirect.source} masque une page qui existe : retire-la ou supprime la page.`)
    if (redirect.destination.startsWith("/") && !existing.has(slug(redirect.destination)))
      say(`La redirection ${redirect.source} mène à ${redirect.destination}, une page qui n'existe pas.`)
  }
  return problems
}
