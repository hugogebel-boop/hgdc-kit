import type { z } from "zod"

/*
 * Erreurs des API publiques au format RFC 9457 (Problem Details, `application/problem+json`) :
 * `type` (URI stable qui identifie le cas), `title` (fixe pour un type), `status`, `detail`
 * (propre à cette occurrence), `instance`, plus des membres d'extension. Le catalogue `PROBLEMS`
 * fixe les types : un client peut s'y fier d'une version à l'autre.
 *
 * Deux produits imitent une API connue (Mail celle de Resend, Host celle de Vercel) : leurs routes
 * compatibles répondent dans le dialecte attendu par les SDK de ces services (`toDialect`).
 */

export const PROBLEM_MEDIA_TYPE = "application/problem+json"

/** Racine des URI de type. Chaque type a sa page d'explication sous cette adresse. */
export const PROBLEM_BASE = "https://hgdc.ch/problems/"

export type ProblemDetails = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  [extension: string]: unknown
}

export type ProblemSlug =
  | "invalid_request"
  | "validation_failed"
  | "authentication_required"
  | "invalid_token"
  | "forbidden"
  | "insufficient_scope"
  | "not_found"
  | "method_not_allowed"
  | "not_acceptable"
  | "conflict"
  | "idempotency_conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "quota_exceeded"
  | "internal_error"
  | "unavailable"

/** Catalogue des types stables. Ajouter un type, jamais en renommer un. */
export const PROBLEMS: Readonly<Record<ProblemSlug, { readonly status: number; readonly title: string }>> = {
  invalid_request: { status: 400, title: "Requête invalide" },
  validation_failed: { status: 422, title: "Paramètres invalides" },
  authentication_required: { status: 401, title: "Authentification requise" },
  invalid_token: { status: 401, title: "Jeton invalide ou expiré" },
  forbidden: { status: 403, title: "Accès refusé" },
  insufficient_scope: { status: 403, title: "Droits insuffisants" },
  not_found: { status: 404, title: "Ressource introuvable" },
  method_not_allowed: { status: 405, title: "Méthode non autorisée" },
  not_acceptable: { status: 406, title: "Format de réponse non disponible" },
  conflict: { status: 409, title: "Conflit" },
  idempotency_conflict: { status: 409, title: "Clé d'idempotence déjà utilisée" },
  payload_too_large: { status: 413, title: "Requête trop volumineuse" },
  unsupported_media_type: { status: 415, title: "Format de requête non pris en charge" },
  rate_limited: { status: 429, title: "Trop de requêtes" },
  quota_exceeded: { status: 429, title: "Quota dépassé" },
  internal_error: { status: 500, title: "Erreur interne" },
  unavailable: { status: 503, title: "Service indisponible" },
}

const RESERVED = new Set(["type", "title", "status", "detail", "instance"])

export function problemType(slug: ProblemSlug): string {
  return `${PROBLEM_BASE}${slug.replace(/_/g, "-")}`
}

/**
 * Un problème du catalogue. Les extensions ne remplacent jamais un membre réservé. `detail` est
 * lu par une personne : jamais de message d'erreur interne, de pile ni de secret.
 */
export function problem(
  slug: ProblemSlug,
  options: { detail?: string; instance?: string; extensions?: Record<string, unknown> } = {},
): ProblemDetails {
  const { status, title } = PROBLEMS[slug]
  const extensions = Object.fromEntries(Object.entries(options.extensions ?? {}).filter(([k]) => !RESERVED.has(k)))
  return {
    ...extensions,
    type: problemType(slug),
    title,
    status,
    ...(options.detail !== undefined && { detail: options.detail }),
    ...(options.instance !== undefined && { instance: options.instance }),
  }
}

/** Slug d'un problème du catalogue, `null` pour un type qui n'en vient pas. */
export function problemSlug(problem: Pick<ProblemDetails, "type">): ProblemSlug | null {
  if (!problem.type.startsWith(PROBLEM_BASE)) return null
  const slug = problem.type.slice(PROBLEM_BASE.length).replace(/-/g, "_")
  return Object.hasOwn(PROBLEMS, slug) ? (slug as ProblemSlug) : null
}

export function isProblem(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.type === "string" && typeof v.title === "string" && typeof v.status === "number"
}

/** La réponse HTTP d'un problème. `headers` s'ajoutent (Retry-After, WWW-Authenticate…). */
export function problemResponse(problem: ProblemDetails, headers?: HeadersInit): Response {
  const h = new Headers(headers)
  h.set("content-type", PROBLEM_MEDIA_TYPE)
  h.set("cache-control", "no-store")
  return new Response(JSON.stringify(problem), { status: problem.status, headers: h })
}

/** Une erreur de champ : pointeur JSON (RFC 6901) vers le champ, et ce qui ne va pas. */
export type FieldError = { pointer: string; detail: string }

function pointer(path: readonly PropertyKey[]): string {
  return `#/${path.map((p) => String(p).replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`
}

/** Les erreurs de champ d'une validation Zod 4, au format de l'exemple de la RFC 9457 (§ 3). */
export function fieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({ pointer: pointer(issue.path), detail: issue.message }))
}

/** `validation_failed` avec la liste `errors` des champs refusés. */
export function validationProblem(
  error: z.ZodError,
  detail = "Un ou plusieurs paramètres sont invalides.",
): ProblemDetails {
  return problem("validation_failed", { detail, extensions: { errors: fieldErrors(error) } })
}

/* Dialectes des API compatibles. */

export type Dialect = "problem" | "resend" | "vercel"

/** Corps d'erreur de l'API Resend : `{ statusCode, name, message }`. */
export type ResendError = { statusCode: number; name: string; message: string }

/** Corps d'erreur de l'API Vercel : `{ error: { code, message } }`. */
export type VercelError = { error: { code: string; message: string } }

const RESEND_NAMES: Record<ProblemSlug, string> = {
  invalid_request: "invalid_parameter",
  validation_failed: "validation_error",
  authentication_required: "missing_api_key",
  invalid_token: "invalid_api_key",
  forbidden: "restricted_api_key",
  insufficient_scope: "restricted_api_key",
  not_found: "not_found",
  method_not_allowed: "method_not_allowed",
  not_acceptable: "invalid_parameter",
  conflict: "invalid_idempotent_request",
  idempotency_conflict: "invalid_idempotency_key",
  payload_too_large: "invalid_attachment",
  unsupported_media_type: "invalid_parameter",
  rate_limited: "rate_limit_exceeded",
  quota_exceeded: "monthly_quota_exceeded",
  internal_error: "application_error",
  unavailable: "application_error",
}

const VERCEL_CODES: Record<ProblemSlug, string> = {
  invalid_request: "bad_request",
  validation_failed: "bad_request",
  authentication_required: "forbidden",
  invalid_token: "forbidden",
  forbidden: "forbidden",
  insufficient_scope: "forbidden",
  not_found: "not_found",
  method_not_allowed: "method_not_allowed",
  not_acceptable: "bad_request",
  conflict: "conflict",
  idempotency_conflict: "conflict",
  payload_too_large: "payload_too_large",
  unsupported_media_type: "bad_request",
  rate_limited: "rate_limited",
  quota_exceeded: "rate_limited",
  internal_error: "internal_server_error",
  unavailable: "internal_server_error",
}

function message(problem: ProblemDetails): string {
  return problem.detail ?? problem.title
}

export function toResend(problem: ProblemDetails): ResendError {
  const slug = problemSlug(problem)
  return {
    statusCode: problem.status,
    name: slug ? RESEND_NAMES[slug] : "application_error",
    message: message(problem),
  }
}

export function toVercel(problem: ProblemDetails): VercelError {
  const slug = problemSlug(problem)
  return { error: { code: slug ? VERCEL_CODES[slug] : "internal_server_error", message: message(problem) } }
}

/** La réponse d'un problème dans le dialecte d'une route : problem+json, ou le JSON de Resend ou Vercel. */
export function dialectResponse(problem: ProblemDetails, dialect: Dialect, headers?: HeadersInit): Response {
  if (dialect === "problem") return problemResponse(problem, headers)
  const h = new Headers(headers)
  h.set("content-type", "application/json")
  h.set("cache-control", "no-store")
  const body = dialect === "resend" ? toResend(problem) : toVercel(problem)
  return new Response(JSON.stringify(body), { status: problem.status, headers: h })
}
