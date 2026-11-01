import { z } from "zod"

/**
 * Contrat de `POST /api/v1/ask` entre le widget du site et la console. Une seule source,
 * importée des deux côtés : un champ ajouté ici est vu par le build et par l'API.
 */
export const MAX_QUESTION = 1000
export const MAX_PREVIOUS = 3

export const askRequestSchema = z.object({
  project: z.string().regex(/^[a-z0-9]{8,64}$/),
  question: z.string().trim().min(2).max(MAX_QUESTION),
  /** Chemin de la page ouverte : l'assistant la privilégie dans sa recherche. */
  page: z.string().startsWith("/").max(512).optional(),
  /**
   * Échanges précédents, par leur identifiant (`id` des réponses) : le serveur relit ce qu'il a
   * lui-même répondu. Un visiteur ne peut pas glisser une fausse réponse de l'assistant.
   */
  previous: z
    .array(z.string().regex(/^[a-z0-9]{8,64}$/))
    .max(MAX_PREVIOUS)
    .optional(),
})

export type AskRequest = z.infer<typeof askRequestSchema>

export const sourceSchema = z.object({
  n: z.number().int().positive(),
  title: z.string(),
  section: z.string().nullable(),
  url: z.string(),
})

export type AnswerSource = z.infer<typeof sourceSchema>

export const askResponseSchema = z.object({
  id: z.string(),
  /** `no_answer` : rien dans la doc ne répond, l'assistant le dit au lieu d'inventer. */
  status: z.enum(["answered", "no_answer"]),
  /** Markdown restreint ; `[^n]` renvoie à la source `n`. */
  answer: z.string(),
  sources: z.array(sourceSchema),
})

export type AskResponse = z.infer<typeof askResponseSchema>

export const ASK_ERRORS = {
  invalid_request: "La question n'a pas pu être lue.",
  project_not_found: "Cette documentation n'a pas d'assistant.",
  assistant_disabled: "L'assistant est désactivé pour cette documentation.",
  origin_not_allowed: "Cet assistant ne répond que depuis son site de documentation.",
  rate_limited: "Trop de questions d'un coup. Réessayez dans une minute.",
  quota_exceeded: "L'assistant a atteint sa limite de questions pour ce mois.",
  not_indexed: "La documentation n'est pas encore indexée. Réessayez après la prochaine publication.",
  unavailable: "L'assistant ne répond pas pour l'instant. Réessayez dans un moment.",
} as const

export type AskErrorCode = keyof typeof ASK_ERRORS

export const askErrorSchema = z.object({
  error: z.object({
    code: z.enum(Object.keys(ASK_ERRORS) as [AskErrorCode, ...Array<AskErrorCode>]),
    message: z.string(),
  }),
})
