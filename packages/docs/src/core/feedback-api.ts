import { z } from "zod"

/**
 * Contrat de `POST /api/v1/feedback` entre le bas de chaque page (« Cette page t'a aidé ? »)
 * et la console. Aucune donnée personnelle : la page, la réponse, un commentaire facultatif.
 */
export const MAX_FEEDBACK_COMMENT = 1000
/** Code joint à un signalement « Signaler un code faux », tronqué par le site. */
export const MAX_FEEDBACK_CODE = 2000

export const feedbackRequestSchema = z
  .object({
    project: z.string().regex(/^[a-z0-9]{8,64}$/),
    /** Chemin de la page, `base` compris (`/docs/guides/publier/`). */
    page: z.string().startsWith("/").max(512),
    helpful: z.boolean(),
    comment: z.string().trim().max(MAX_FEEDBACK_COMMENT).optional(),
    /** `code` : « Signaler un code faux » sur un bloc de code ; absent, l'avis porte sur la page. */
    kind: z.enum(["page", "code"]).optional(),
    code: z.string().max(MAX_FEEDBACK_CODE).optional(),
  })
  .refine((value) => value.kind !== "code" || Boolean(value.comment), {
    message: "un signalement de code dit ce qui ne va pas",
    path: ["comment"],
  })

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>
