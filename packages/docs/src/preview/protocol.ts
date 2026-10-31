import { z } from "zod"

import { PREVIEW_LIMITS } from "../core/preview.ts"

/**
 * `POST /v1/sync` de la passerelle d'aperçu (ADR 0011), appelé par Convex seulement.
 *
 * - `repo` : fichiers du dépôt à la branche ouverte (chemin, empreinte Git). Absent : mise à
 *   jour des seuls brouillons d'une session déjà ouverte.
 * - `overlay` : mes brouillons par-dessus (empreinte du contenu, `null` pour une suppression).
 * - `blobs` : contenus par empreinte. La passerelle répond par les empreintes qu'elle n'a
 *   pas encore ; Convex les lit (Host, stockage) et rappelle.
 */
const sha = z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/)

/** Empreinte opaque (SHA-256 en hexadécimal) : la passerelle ne voit ni personne ni projet en clair. */
const opaque = z.string().regex(/^[a-f0-9]{32,64}$/)

const schema = z.object({
  key: opaque,
  /** Personne (une session par personne), organisation (plafond par organisation), projet. */
  owner: opaque,
  organization: opaque,
  project: opaque,
  repo: z
    .array(z.object({ path: z.string(), sha }))
    .max(PREVIEW_LIMITS.files)
    .optional(),
  overlay: z.array(z.object({ path: z.string(), sha: sha.nullable() })).max(PREVIEW_LIMITS.files),
  blobs: z
    .array(
      z.object({
        sha,
        encoding: z.enum(["utf-8", "base64"]),
        content: z.string().max(Math.ceil((PREVIEW_LIMITS.imageBytes * 4) / 3) + 4),
      }),
    )
    .max(PREVIEW_LIMITS.files),
})

export type SyncRequest = z.infer<typeof schema>

/** `POST /v1/close` : ferme les sessions d'une personne, d'une organisation ou d'un projet (accès perdu, doc supprimée). */
const closeSchema = z.union([
  z.object({ owner: opaque }),
  z.object({ organization: opaque }),
  z.object({ project: opaque }),
])
export type CloseRequest = z.infer<typeof closeSchema>

export function parseCloseRequest(body: string): CloseRequest | null {
  try {
    const parsed = closeSchema.safeParse(JSON.parse(body))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function parseSyncRequest(
  body: string,
  isDocFile: (path: string) => boolean,
): { ok: true; value: SyncRequest } | { ok: false; message: string } {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { ok: false, message: "JSON illisible." }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: "Requête invalide." }
  // Même règle que l'éditeur et Host : docs.json, pages et images du dossier, rien de caché.
  const paths = [...(parsed.data.repo ?? []), ...parsed.data.overlay].map((file) => file.path)
  const bad = paths.find((path) => !isDocFile(path))
  if (bad !== undefined) return { ok: false, message: `Fichier refusé : ${bad.slice(0, 100)}` }
  return { ok: true, value: parsed.data }
}
