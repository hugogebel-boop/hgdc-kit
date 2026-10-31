/**
 * Pages de référence d'API générées depuis une spécification OpenAPI 3.x.
 *
 * Pur et déterministe : même spécification, mêmes pages, octet pour octet (le `--check` d'une doc
 * s'appuie là-dessus). Le résultat est du MDX ordinaire (titres, tableaux, blocs de code), donc la
 * recherche, `llms.txt`, la version Markdown des pages et l'assistant le lisent comme une page
 * écrite à la main.
 */
import { z } from "zod"

const METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const
type Method = (typeof METHODS)[number]

type Json = Record<string, unknown>

const objectSchema: z.ZodType<Json> = z.record(z.string(), z.unknown())

const documentSchema = z.looseObject({
  openapi: z.string().regex(/^3\./, "Seul OpenAPI 3.x est pris en charge."),
  info: z.looseObject({ title: z.string() }),
  paths: objectSchema,
})

export type OpenApiOptions = {
  /** Titre d'une page à partir de son groupe (par défaut : le nom du tag). */
  titles?: Record<string, string>
  /** Adresse de base des exemples (par défaut : `servers[0].url` de la spécification). */
  baseUrl?: string
  /** Variable d'environnement qui porte la clé dans les exemples. */
  keyVariable?: string
}

export type OpenApiPage = {
  /** Nom de fichier sans extension : `emails`, `projets`. */
  slug: string
  title: string
  description: string
  /** Contenu complet, frontmatter compris. */
  mdx: string
}

function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

/** Suit un `$ref` local (`#/components/...`). Le nom du composant sert à étiqueter les types. */
function resolve(root: Json, node: unknown, seen: ReadonlySet<string> = new Set()): { value: Json; ref?: string } {
  let current = record(node) ?? {}
  let ref: string | undefined
  const visited = new Set(seen)
  while (typeof current.$ref === "string") {
    const pointer = current.$ref
    if (!pointer.startsWith("#/") || visited.has(pointer)) break
    visited.add(pointer)
    ref ??= pointer
    let target: unknown = root
    for (const part of pointer.slice(2).split("/")) {
      target = record(target)?.[part.replaceAll("~1", "/").replaceAll("~0", "~")]
    }
    current = record(target) ?? {}
  }
  return ref ? { value: current, ref } : { value: current }
}

function refName(ref: string | undefined): string | undefined {
  return ref?.split("/").at(-1)
}

/** Fusionne les `allOf` d'un schéma en un seul objet. */
function flatten(root: Json, schema: Json, seen: ReadonlySet<string>): Json {
  const parts = list(schema.allOf)
  if (parts.length === 0) return schema
  const merged: Json = { ...schema }
  delete merged.allOf
  const properties: Json = { ...record(schema.properties) }
  const required = [...list(schema.required)]
  for (const part of parts) {
    const { value, ref } = resolve(root, part, seen)
    const inner = flatten(root, value, new Set([...seen, ...(ref ? [ref] : [])]))
    Object.assign(properties, record(inner.properties))
    required.push(...list(inner.required))
    for (const [key, entry] of Object.entries(inner)) if (!(key in merged)) merged[key] = entry
  }
  if (Object.keys(properties).length > 0) merged.properties = properties
  if (required.length > 0) merged.required = required
  return merged
}

function inline(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim()
}

/** Texte de prose pour du MDX : `{`, `}` et `<` hors des morceaux de code seraient lus comme du JSX. */
function prose(value: string): string {
  return value
    .split(/(`[^`]*`)/)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("<", "&lt;"),
    )
    .join("")
}

function cell(value: string): string {
  return prose(inline(value)).replaceAll("|", "\\|")
}

function code(value: string): string {
  return `\`${value.replaceAll("|", "\\|")}\``
}

/** Type lisible d'un schéma : `string`, `string[]`, `"a" | "b"`, `Contact` pour un composant. */
function typeLabel(root: Json, node: unknown, seen: ReadonlySet<string>): string {
  const { value, ref } = resolve(root, node, seen)
  const name = refName(ref)
  const schema = flatten(root, value, seen)
  const inner = new Set([...seen, ...(ref ? [ref] : [])])
  if (list(schema.enum).length > 0)
    return list(schema.enum)
      .map((entry) => JSON.stringify(entry))
      .join(" | ")
  const alternatives = list(schema.oneOf).length > 0 ? list(schema.oneOf) : list(schema.anyOf)
  if (alternatives.length > 0) return alternatives.map((entry) => typeLabel(root, entry, inner)).join(" ou ")
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter(
    (entry): entry is string => typeof entry === "string",
  )
  const labels = types.map((type) => {
    if (type === "array") return `${typeLabel(root, schema.items, inner)}[]`
    if (type === "object") return name ?? "objet"
    if (type === "string" && typeof schema.format === "string") return `string (${schema.format})`
    return type
  })
  if (labels.length > 0) return labels.join(" ou ")
  if (record(schema.properties)) return name ?? "objet"
  return name ?? "any"
}

type Row = { name: string; type: string; required: boolean; description: string }

function describe(schema: Json): string {
  const parts = [inline(text(schema.description))]
  if (schema.default !== undefined) parts.push(`Par défaut : ${code(JSON.stringify(schema.default))}.`)
  const bounds: Array<string> = []
  if (typeof schema.minimum === "number") bounds.push(`min. ${schema.minimum}`)
  if (typeof schema.maximum === "number") bounds.push(`max. ${schema.maximum}`)
  if (typeof schema.minLength === "number") bounds.push(`${schema.minLength} caractères au moins`)
  if (typeof schema.maxLength === "number") bounds.push(`${schema.maxLength} caractères au plus`)
  if (typeof schema.maxItems === "number") bounds.push(`${schema.maxItems} éléments au plus`)
  if (bounds.length > 0) parts.push(`${bounds.join(", ")}.`)
  return parts.filter(Boolean).join(" ")
}

const MAX_DEPTH = 3

/** Aplatit les propriétés d'un schéma objet en lignes (`items[].name`), trois niveaux au plus. */
function rows(root: Json, node: unknown, prefix: string, seen: ReadonlySet<string>, depth: number): Array<Row> {
  const { value, ref } = resolve(root, node, seen)
  const inner = new Set([...seen, ...(ref ? [ref] : [])])
  const schema = flatten(root, value, inner)
  const properties = record(schema.properties)
  if (!properties) return []
  const required = new Set(list(schema.required).map(String))
  const out: Array<Row> = []
  for (const [key, child] of Object.entries(properties)) {
    const resolved = resolve(root, child, inner)
    const childSchema = flatten(root, resolved.value, inner)
    const name = `${prefix}${key}`
    out.push({
      name,
      type: typeLabel(root, child, inner),
      required: required.has(key),
      description: describe(childSchema),
    })
    if (depth >= MAX_DEPTH) continue
    const childSeen = new Set([...inner, ...(resolved.ref ? [resolved.ref] : [])])
    if (resolved.ref && inner.has(resolved.ref)) continue
    const items = resolve(root, childSchema.items, childSeen)
    if (childSchema.type === "array" && record(items.value)?.properties !== undefined) {
      out.push(...rows(root, childSchema.items, `${name}[].`, childSeen, depth + 1))
    } else if (childSchema.properties !== undefined) {
      out.push(...rows(root, resolved.value, `${name}.`, childSeen, depth + 1))
    }
  }
  return out
}

function table(header: Array<string>, body: Array<Array<string>>): string {
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...body.map((line) => `| ${line.join(" | ")} |`),
  ].join("\n")
}

function fieldTable(fields: Array<Row>, withRequired = true): string {
  return table(
    withRequired ? ["Champ", "Type", "Obligatoire", "Description"] : ["Champ", "Type", "Description"],
    fields.map((field) => [
      code(field.name),
      cell(field.type),
      ...(withRequired ? [field.required ? "Oui" : "Non"] : []),
      cell(field.description),
    ]),
  )
}

/** Exemple de valeur : `example`, `default`, première valeur d'`enum`, sinon une valeur du type. */
function sample(root: Json, node: unknown, seen: ReadonlySet<string>, depth = 0): unknown {
  const { value, ref } = resolve(root, node, seen)
  const inner = new Set([...seen, ...(ref ? [ref] : [])])
  const schema = flatten(root, value, inner)
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (list(schema.enum).length > 0) return list(schema.enum)[0]
  const alternatives = list(schema.oneOf).length > 0 ? list(schema.oneOf) : list(schema.anyOf)
  if (alternatives.length > 0) return sample(root, alternatives[0], inner, depth)
  const type = Array.isArray(schema.type) ? schema.type.find((entry) => entry !== "null") : schema.type
  if (type === "object" || record(schema.properties)) {
    if (depth >= 4) return {}
    const properties = record(schema.properties) ?? {}
    const required = new Set(list(schema.required).map(String))
    const keys = Object.keys(properties).filter((key) => required.has(key))
    const out: Json = {}
    for (const key of keys.length > 0 ? keys : Object.keys(properties).slice(0, 3)) {
      const child = resolve(root, properties[key], inner)
      if (child.ref && inner.has(child.ref)) continue
      out[key] = sample(root, properties[key], inner, depth + 1)
    }
    return out
  }
  if (type === "array") return depth >= 4 ? [] : [sample(root, schema.items, inner, depth + 1)]
  if (type === "integer" || type === "number") return typeof schema.minimum === "number" ? schema.minimum : 1
  if (type === "boolean") return true
  switch (schema.format) {
    case "date-time":
      return "2026-01-15T09:30:00Z"
    case "date":
      return "2026-01-15"
    case "email":
      return "nom@exemple.ch"
    case "uri":
      return "https://exemple.ch"
    default:
      return "exemple"
  }
}

function jsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

type Operation = {
  method: Method
  path: string
  node: Json
  /** Paramètres de l'élément de chemin, repris par chaque opération. */
  shared: Array<unknown>
}

function groupOf(operation: Operation): string {
  const tag = text(list(operation.node.tags)[0])
  if (tag) return tag
  // Sans tag : le premier segment du chemin hors version (`/v9/projects/{id}` donne `projects`).
  const segment = operation.path
    .split("/")
    .find((part) => part && !/^v\d+$/.test(part) && !part.startsWith("{") && part !== "now" && part !== "api")
  return segment ?? "api"
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "api"
  )
}

function security(root: Json, operation: Operation): string {
  const requirements = operation.node.security !== undefined ? list(operation.node.security) : list(root.security)
  if (requirements.length === 0) return "Aucune clé n'est demandée."
  const scopes = requirements.flatMap((requirement) =>
    Object.values(record(requirement) ?? {}).flatMap((entry) => list(entry).map(String)),
  )
  const unique = [...new Set(scopes)]
  return unique.length > 0
    ? `Demande une clé d'API avec ${unique.length > 1 ? "l'une des portées" : "la portée"} ${unique.map(code).join(", ")}.`
    : "Demande une clé d'API."
}

function operationSection(root: Json, operation: Operation, options: OpenApiOptions, baseUrl: string): string {
  const { node, method, path } = operation
  const lines: Array<string> = []
  lines.push(`## ${method.toUpperCase()} ${prose(path)}`, "")
  const summary = inline(text(node.summary))
  if (summary) lines.push(`**${prose(summary)}**`, "")
  const description = text(node.description).trim()
  if (description) lines.push(prose(description), "")
  lines.push(security(root, operation), "")
  if (node.deprecated === true) lines.push("Cette route est dépréciée.", "")

  const parameters = [...operation.shared, ...list(node.parameters)].map((entry) => resolve(root, entry))
  for (const [place, title] of [
    ["path", "Paramètres de chemin"],
    ["query", "Paramètres de requête"],
    ["header", "En-têtes"],
  ] as const) {
    const ofPlace = parameters.filter((entry) => entry.value.in === place)
    if (ofPlace.length === 0) continue
    lines.push(`### ${title}`, "")
    lines.push(
      fieldTable(
        ofPlace.map(({ value }) => {
          const schema = resolve(root, value.schema)
          return {
            name: text(value.name),
            type: typeLabel(root, value.schema, new Set()),
            required: value.required === true || place === "path",
            description: describe({
              ...schema.value,
              description: text(value.description) || text(schema.value.description),
            }),
          }
        }),
      ),
      "",
    )
  }

  const body = resolve(root, node.requestBody)
  const bodyContent = record(body.value.content)
  const bodyType = bodyContent
    ? (Object.keys(bodyContent).find((type) => type.includes("json")) ?? Object.keys(bodyContent)[0])
    : undefined
  const bodySchema = bodyType ? record(bodyContent?.[bodyType])?.schema : undefined
  if (bodyType && bodySchema) {
    lines.push("### Corps de la requête", "")
    lines.push(`Type de contenu : ${code(bodyType)}${body.value.required === true ? "." : ", facultatif."}`, "")
    const fields = rows(root, bodySchema, "", new Set(), 1)
    if (fields.length > 0) lines.push(fieldTable(fields), "")
    else lines.push(`Type : ${code(typeLabel(root, bodySchema, new Set()))}.`, "")
  }

  const responses = Object.entries(record(node.responses) ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (responses.length > 0) {
    lines.push("### Réponses", "")
    lines.push(
      table(
        ["Code", "Description", "Corps"],
        responses.map(([status, entry]) => {
          const response = resolve(root, entry)
          const content = record(response.value.content)
          const type = content ? Object.keys(content)[0] : undefined
          const schema = type ? record(content?.[type])?.schema : undefined
          const label = schema ? `${code(typeLabel(root, schema, new Set()))}` : ""
          return [code(status), cell(text(response.value.description)), label]
        }),
      ),
      "",
    )
  }

  // Exemple de requête.
  const key = options.keyVariable ?? "HGDC_API_KEY"
  const url = `${baseUrl}${path.replaceAll(/\{([^}]+)\}/g, (_, name: string) => `<${name}>`)}`
  const curl = [`curl -X ${method.toUpperCase()} "${url}"`]
  const needsKey =
    operation.node.security !== undefined ? list(operation.node.security).length > 0 : list(root.security).length > 0
  if (needsKey) curl.push(`  -H "Authorization: Bearer $${key}"`)
  if (bodyType && bodySchema) {
    curl.push(`  -H "Content-Type: ${bodyType}"`)
    if (bodyType.includes("json"))
      curl.push(`  -d '${JSON.stringify(sample(root, bodySchema, new Set())).replaceAll("'", "'\\''")}'`)
  }
  lines.push("### Exemple", "", "```bash", curl.join(" \\\n"), "```", "")

  const success = responses.find(([status]) => status.startsWith("2"))
  if (success) {
    const response = resolve(root, success[1])
    const content = record(response.value.content)
    const type = content ? Object.keys(content).find((entry) => entry.includes("json")) : undefined
    const schema = type ? record(content?.[type])?.schema : undefined
    if (schema) {
      const fields = rows(root, schema, "", new Set(), 1)
      if (fields.length > 0)
        lines.push(`### Champs de la réponse ${code(success[0])}`, "", fieldTable(fields, false), "")
      lines.push(`Réponse ${code(success[0])} :`, "", jsonBlock(sample(root, schema, new Set())), "")
    }
  }
  return lines.join("\n")
}

function collect(paths: Json): Array<Operation> {
  const out: Array<Operation> = []
  for (const [path, item] of Object.entries(paths)) {
    const entry = record(item)
    if (!entry) continue
    for (const method of METHODS) {
      const node = record(entry[method])
      if (node) out.push({ method, path, node, shared: list(entry.parameters) })
    }
  }
  return out
}

/** Une page par groupe (le premier tag de l'opération), dans l'ordre de la spécification. */
export function openApiPages(input: unknown, options: OpenApiOptions = {}): Array<OpenApiPage> {
  const document = documentSchema.parse(input)
  const root: Json = document
  const server = text(list(root.servers).map(record)[0]?.url).replace(/\/$/, "")
  const baseUrl = (options.baseUrl ?? server).replace(/\/$/, "")
  const tagDescriptions = new Map(
    list(root.tags).flatMap((tag) => {
      const entry = record(tag)
      return entry ? [[text(entry.name), inline(text(entry.description))] as const] : []
    }),
  )

  const groups = new Map<string, Array<Operation>>()
  for (const operation of collect(document.paths)) {
    const group = groupOf(operation)
    groups.set(group, [...(groups.get(group) ?? []), operation])
  }

  const used = new Set<string>()
  return [...groups].map(([group, operations]) => {
    let slug = slugify(options.titles?.[group] ?? group)
    for (let n = 2; used.has(slug); n++) slug = `${slugify(group)}-${n}`
    used.add(slug)
    const title = options.titles?.[group] ?? group
    const description =
      tagDescriptions.get(group) ||
      `Routes ${operations
        .map((o) => `${o.method.toUpperCase()} ${o.path}`)
        .slice(0, 2)
        .join(", ")}${operations.length > 2 ? "…" : ""}.`
    const body = operations.map((operation) => operationSection(root, operation, options, baseUrl)).join("\n")
    const mdx = [
      "---",
      `title: ${JSON.stringify(title)}`,
      `description: ${JSON.stringify(description)}`,
      "---",
      "",
      "{/* Généré depuis la spécification OpenAPI : ne pas modifier à la main. */}",
      "",
      body.trimEnd(),
      "",
    ].join("\n")
    return { slug, title, description, mdx }
  })
}
