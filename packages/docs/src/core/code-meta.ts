/**
 * Options d'un bloc de code, écrites comme chez Mintlify après le langage :
 *
 *     ```ts app/config.ts lines wrap expandable nocopy
 *
 * Le nom de fichier est fait des mots qui ne sont pas des options ; `title="…"` est accepté
 * aussi. Lu par le build (`build/code-meta.ts`, plugin d'Expressive Code) et par le mode visuel
 * de l'éditeur, qui les coche dans le menu « … » du bloc : un seul analyseur pour les deux.
 */

export type CodeMeta = {
  /** Nom de fichier ou titre affiché dans l'en-tête du bloc ; `null` sans en-tête. */
  title: string | null
  /** Numéros de ligne. */
  lines: boolean
  /** Retour à la ligne des lignes longues. */
  wrap: boolean
  /** Bloc long replié, avec « Afficher tout le code ». */
  expandable: boolean
  /** Sans bouton Copier. */
  nocopy: boolean
  /** Le reste, gardé tel quel et dans l'ordre (`{1-3}`, `ins={4}`, `twoslash`…). */
  rest: Array<string>
}

export const CODE_FLAGS = ["lines", "wrap", "expandable", "nocopy"] as const
export type CodeFlag = (typeof CODE_FLAGS)[number]

/** Mots connus des outils de code qui ne sont pas un nom de fichier : gardés dans `rest`. */
const OTHER_WORDS = new Set(["twoslash", "showLineNumbers", "frame", "preserveIndent", "collapse"])

const isFlag = (word: string): word is CodeFlag => (CODE_FLAGS as ReadonlyArray<string>).includes(word)

/** Une option d'un autre outil : `clé=valeur`, plage `{…}`, chaîne, expression `/…/`, mot connu. */
const isOption = (token: string) =>
  token.includes("=") || /^[{"']/.test(token) || /^\/.*\/$/.test(token) || OTHER_WORDS.has(token)

/** Découpe la méta en mots, sans couper une chaîne entre guillemets ni une plage `{…}`. */
function tokens(meta: string): Array<string> {
  return meta.match(/(?:[^\s"'{}=]+=)?(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s"'{}]+)/g) ?? []
}

const unquote = (value: string) => value.replace(/^(["'])([\s\S]*)\1$/, "$2")

export function parseCodeMeta(meta: string | null | undefined): CodeMeta {
  const result: CodeMeta = { title: null, lines: false, wrap: false, expandable: false, nocopy: false, rest: [] }
  const words: Array<string> = []
  for (const token of tokens(meta ?? "")) {
    if (isFlag(token)) result[token] = true
    else if (token.startsWith("title=")) result.title = unquote(token.slice("title=".length))
    else if (isOption(token)) result.rest.push(token)
    else words.push(token)
  }
  if (result.title === null && words.length > 0) result.title = words.join(" ")
  return result
}

/** Réécrit la méta : nom de fichier nu quand il se relit à l'identique, sinon `title="…"`. */
export function formatCodeMeta(meta: CodeMeta): string {
  const parts: Array<string> = []
  const title = meta.title?.trim()
  if (title) {
    const bare = title.split(/\s+/).every((word) => !isFlag(word) && !isOption(word) && !/["'{}]/.test(word))
    parts.push(bare ? title : `title="${title.replaceAll('"', "'")}"`)
  }
  for (const flag of CODE_FLAGS) if (meta[flag]) parts.push(flag)
  parts.push(...meta.rest)
  return parts.join(" ")
}
