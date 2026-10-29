import { z } from "zod"
import { PROBLEM_MEDIA_TYPE, PROBLEMS } from "./errors.ts"

/*
 * Petits outils pour écrire la spécification OpenAPI 3.1 d'une API publique à partir des schémas
 * Zod 4 qui valident déjà ses entrées : un seul schéma pour le contrôle et la doc. Composants
 * communs : `Problem` (RFC 9457), réponses d'erreur par statut, enveloppe de pagination, sécurité
 * Bearer. Pas un générateur : chaque produit compose ses chemins avec `operation()`.
 */

export const OPENAPI_VERSION = "3.1.1"

type Schema = Record<string, unknown>

/** Schéma JSON (2020-12, celui d'OpenAPI 3.1) d'un schéma Zod, sans `$schema`. */
export function jsonSchema(schema: z.ZodType, io: "input" | "output" = "output"): Schema {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Schema
  return rest
}

export const PROBLEM_SCHEMA: Schema = {
  type: "object",
  description: "Erreur au format RFC 9457 (application/problem+json).",
  required: ["type", "title", "status"],
  properties: {
    type: { type: "string", format: "uri", description: "Identifie le cas d'erreur, stable." },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
    instance: { type: "string" },
    errors: {
      type: "array",
      description: "Champs refusés (erreur de validation).",
      items: {
        type: "object",
        required: ["pointer", "detail"],
        properties: { pointer: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
  additionalProperties: true,
}

/** Enveloppe d'une liste paginée (`@hgdc/api/pagination`) autour du schéma d'un élément. */
export function paginatedSchema(item: Schema): Schema {
  return {
    type: "object",
    required: ["data", "next_cursor", "has_more"],
    properties: {
      data: { type: "array", items: item },
      next_cursor: { type: ["string", "null"], description: "À renvoyer en `cursor` pour la page suivante." },
      has_more: { type: "boolean" },
    },
  }
}

/** Paramètres `limit` et `cursor` d'une liste paginée. */
export function paginationParameters(maxLimit = 100): Schema[] {
  return [
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: maxLimit, default: 20 },
    },
    { name: "cursor", in: "query", required: false, schema: { type: "string" } },
  ]
}

/** Titre du premier type du catalogue pour chaque statut (le plus général). */
const STATUS_TITLES: Record<number, string> = Object.values(PROBLEMS).reduce<Record<number, string>>(
  (titles, { status, title }) => (status in titles ? titles : { ...titles, [status]: title }),
  {},
)

/** Nom du composant de réponse d'un statut d'erreur : `Problem401`. */
function problemResponseName(status: number): string {
  return `Problem${status}`
}

/** Les réponses d'erreur à référencer dans une opération. */
export function problemResponses(statuses: readonly number[]): Record<string, Schema> {
  return Object.fromEntries(
    statuses.map((status) => [String(status), { $ref: `#/components/responses/${problemResponseName(status)}` }]),
  )
}

export type OperationOptions = {
  operationId: string
  summary: string
  description?: string
  tags?: string[]
  /** Scopes exigés (`mail:read`) : sécurité Bearer de l'opération. Sans scope : opération publique. */
  scopes?: string[]
  query?: z.ZodObject
  body?: z.ZodType
  response?: z.ZodType
  /** La réponse est une liste paginée de `response`. */
  paginated?: boolean
  status?: number
  /** Statuts d'erreur possibles, en plus de 400, 401 et 403 (si scopes), 429 et 500. */
  errors?: number[]
}

/** Une opération OpenAPI : paramètres, corps et réponse depuis Zod, erreurs en problem+json. */
export function operation(options: OperationOptions): Schema {
  const parameters: Schema[] = []
  if (options.query) {
    const schema = jsonSchema(options.query, "input")
    const properties = (schema.properties ?? {}) as Record<string, Schema>
    const required = new Set((schema.required ?? []) as string[])
    for (const [name, property] of Object.entries(properties)) {
      if (options.paginated && (name === "limit" || name === "cursor")) continue
      parameters.push({ name, in: "query", required: required.has(name), schema: property })
    }
  }
  if (options.paginated) parameters.push(...paginationParameters())

  const secured = options.scopes !== undefined
  const errors = [...new Set([400, ...(secured ? [401, 403] : []), ...(options.errors ?? []), 429, 500])].toSorted(
    (a, b) => a - b,
  )
  const status = String(options.status ?? (options.body ? 201 : 200))
  const responseSchema = options.response
    ? options.paginated
      ? paginatedSchema(jsonSchema(options.response))
      : jsonSchema(options.response)
    : undefined

  return {
    operationId: options.operationId,
    summary: options.summary,
    ...(options.description && { description: options.description }),
    ...(options.tags && { tags: options.tags }),
    ...(parameters.length > 0 && { parameters }),
    ...(options.body && {
      requestBody: { required: true, content: { "application/json": { schema: jsonSchema(options.body, "input") } } },
    }),
    ...(secured && { security: [{ bearer: options.scopes }] }),
    responses: {
      [status]: responseSchema
        ? { description: "Succès", content: { "application/json": { schema: responseSchema } } }
        : { description: "Succès" },
      ...problemResponses(errors),
    },
  }
}

export type DocumentOptions = {
  title: string
  version: string
  description?: string
  servers: { url: string; description?: string }[]
  /** `{ "/emails": { post: operation(…) } }` */
  paths: Record<string, Record<string, Schema>>
  schemas?: Record<string, Schema>
  /** Adresse de la doc des scopes ou du serveur d'autorisation, reprise dans le schéma Bearer. */
  bearerDescription?: string
}

/**
 * Le document OpenAPI 3.1. Chaque statut d'erreur cité par une opération devient un composant de
 * réponse `ProblemNNN` en problem+json.
 */
export function openApiDocument(options: DocumentOptions): Schema {
  const statuses = new Set<number>()
  for (const methods of Object.values(options.paths)) {
    for (const op of Object.values(methods)) {
      for (const code of Object.keys((op.responses ?? {}) as Schema)) {
        const n = Number(code)
        if (n >= 400) statuses.add(n)
      }
    }
  }
  const responses = Object.fromEntries(
    [...statuses]
      .toSorted((a, b) => a - b)
      .map((status) => [
        problemResponseName(status),
        {
          description: STATUS_TITLES[status] ?? "Erreur",
          content: { [PROBLEM_MEDIA_TYPE]: { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      ]),
  )
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: options.title,
      version: options.version,
      ...(options.description && { description: options.description }),
    },
    servers: options.servers,
    paths: options.paths,
    components: {
      schemas: { Problem: PROBLEM_SCHEMA, ...options.schemas },
      responses,
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description:
            options.bearerDescription ?? "Clé d'API `hgdc_<produit>_…` ou jeton OAuth, en `Authorization: Bearer`.",
        },
      },
    },
  }
}
