import { z } from "zod"
import { API_LIFECYCLE_POLICY, MIN_SUNSET_NOTICE_DAYS } from "./deprecation.ts"
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

/** En-têtes de réponse communs (`components.headers`). */
const HEADERS: Record<string, Schema> = {
  "RateLimit-Policy": {
    description:
      "Politique de limite : quota (`q`) par fenêtre de `w` secondes (draft-ietf-httpapi-ratelimit-headers).",
    schema: { type: "string" },
  },
  RateLimit: {
    description: "Requêtes restantes (`r`) et secondes avant la remise à plein (`t`).",
    schema: { type: "string" },
  },
  "Retry-After": {
    description: "Secondes à attendre avant de réessayer.",
    required: true,
    schema: { type: "integer" },
  },
  Deprecation: { description: "Date de la dépréciation de la route (RFC 9745).", schema: { type: "string" } },
  Sunset: { description: "Date de retrait de la route (RFC 8594).", schema: { type: "string" } },
  Link: { description: 'Page de migration : `rel="deprecation"` et `rel="sunset"`.', schema: { type: "string" } },
}

const headerRefs = (names: string[]): Record<string, Schema> =>
  Object.fromEntries(names.map((name) => [name, { $ref: `#/components/headers/${name}` }]))

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
  /** Route dépréciée : `deprecated: true`, et ses réponses portent `Deprecation`, `Sunset` et `Link`. */
  deprecated?: boolean
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
    ...(options.deprecated && { deprecated: true }),
    ...(parameters.length > 0 && { parameters }),
    ...(options.body && {
      requestBody: { required: true, content: { "application/json": { schema: jsonSchema(options.body, "input") } } },
    }),
    ...(secured && { security: [{ bearer: options.scopes }] }),
    responses: {
      [status]: {
        description: "Succès",
        headers: headerRefs([
          "RateLimit-Policy",
          "RateLimit",
          ...(options.deprecated ? ["Deprecation", "Sunset", "Link"] : []),
        ]),
        ...(responseSchema && { content: { "application/json": { schema: responseSchema } } }),
      },
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
  /**
   * Scopes nommés de l'API (`mail:read` → ce qu'il permet), publiés en `x-scopes` du schéma Bearer.
   * Obligatoire dès qu'une opération exige un scope, et chaque scope exigé doit y figurer.
   */
  scopes?: Record<string, string>
  /** Document de ressource protégée (RFC 9728) de l'API, avec ses `scopes_supported` : `x-resource-metadata`. */
  resourceMetadata?: string
}

/** Les scopes exigés par les opérations, tous schémas de sécurité confondus. */
function requiredScopes(paths: DocumentOptions["paths"]): Set<string> {
  const scopes = new Set<string>()
  for (const methods of Object.values(paths)) {
    for (const op of Object.values(methods)) {
      for (const requirement of (op.security ?? []) as Record<string, string[]>[]) {
        for (const list of Object.values(requirement)) for (const scope of list) scopes.add(scope)
      }
    }
  }
  return scopes
}

/**
 * Le document OpenAPI 3.1. Chaque statut d'erreur cité par une opération devient un composant de
 * réponse `ProblemNNN` en problem+json. `info.description` se termine par la règle de versions,
 * de dépréciation et de limites de débit (`API_LIFECYCLE_POLICY`), reprise en `x-api-lifecycle`.
 */
export function openApiDocument(options: DocumentOptions): Schema {
  const undeclared = [...requiredScopes(options.paths)].filter((scope) => !Object.hasOwn(options.scopes ?? {}, scope))
  if (undeclared.length > 0) throw new Error(`Scopes exigés mais absents de \`scopes\` : ${undeclared.join(", ")}`)
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
          ...(status === 429 && { headers: headerRefs(["Retry-After", "RateLimit-Policy", "RateLimit"]) }),
          content: { [PROBLEM_MEDIA_TYPE]: { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      ]),
  )
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: options.title,
      version: options.version,
      description: options.description
        ? `${options.description}

${API_LIFECYCLE_POLICY}`
        : API_LIFECYCLE_POLICY,
      "x-api-lifecycle": {
        versioning: "path",
        "breaking-changes": "new-major-version",
        "minimum-sunset-notice-days": MIN_SUNSET_NOTICE_DAYS,
        "deprecation-headers": ["Deprecation", "Sunset", "Link"],
        "rate-limit-headers": ["RateLimit-Policy", "RateLimit", "Retry-After"],
      },
    },
    servers: options.servers,
    paths: options.paths,
    components: {
      schemas: { Problem: PROBLEM_SCHEMA, ...options.schemas },
      responses,
      headers: HEADERS,
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description:
            options.bearerDescription ?? "Clé d'API `hgdc_<produit>_…` ou jeton OAuth, en `Authorization: Bearer`.",
          ...(options.scopes && { "x-scopes": options.scopes }),
          ...(options.resourceMetadata && { "x-resource-metadata": options.resourceMetadata }),
        },
      },
    },
  }
}
