import { fromBase64Url, toBase64Url } from "./encoding.ts"

/*
 * Pagination par curseur des API publiques : `?limit=…&cursor=…`, réponse
 * `{ data, next_cursor, has_more }`. Le curseur est opaque pour le client : du base64url autour
 * d'un état versionné. Il enveloppe le `continueCursor` de Convex (`.paginate()`) sans en exposer
 * la forme, qui peut changer. Il ne porte aucun droit : chaque page revérifie l'accès.
 */

export type Page<T> = { data: T[]; next_cursor: string | null; has_more: boolean }

/** Ce que rend `.paginate()` de Convex (`PaginationResult`), réduit à ce qui sert ici. */
export type ConvexPage<T> = { page: T[]; isDone: boolean; continueCursor: string }

const VERSION = "1"

export function encodeCursor(state: string): string {
  return toBase64Url(`${VERSION}:${state}`)
}

/** L'état d'un curseur, `null` s'il n'en vient pas (altéré, autre version, trop long). */
export function decodeCursor(cursor: string): string | null {
  if (cursor.length === 0 || cursor.length > 4096) return null
  const text = fromBase64Url(cursor)
  if (text === null || !text.startsWith(`${VERSION}:`)) return null
  return text.slice(VERSION.length + 1)
}

/** L'enveloppe publique d'une page Convex ; `map` transforme chaque document en objet public. */
export function fromConvexPage<T, U = T>(result: ConvexPage<T>, map?: (item: T) => U): Page<U> {
  const data = map ? result.page.map(map) : (result.page as unknown as U[])
  return {
    data,
    next_cursor: result.isDone ? null : encodeCursor(result.continueCursor),
    has_more: !result.isDone,
  }
}

export type PageLimits = { defaultLimit?: number; maxLimit?: number }

export type PageRequest =
  | { ok: true; paginationOpts: { numItems: number; cursor: string | null } }
  | { ok: false; detail: string }

/**
 * Les `paginationOpts` de Convex à partir de `limit` et `cursor` (paramètres d'URL ou valeurs).
 * Refuse une limite hors de 1…`maxLimit` et un curseur illisible : à rendre en 400.
 */
export function toPaginationOpts(
  input: { limit?: string | number | null; cursor?: string | null },
  { defaultLimit = 20, maxLimit = 100 }: PageLimits = {},
): PageRequest {
  let numItems = defaultLimit
  if (input.limit !== undefined && input.limit !== null && input.limit !== "") {
    const n = typeof input.limit === "number" ? input.limit : Number(input.limit)
    if (!Number.isInteger(n) || n < 1 || n > maxLimit)
      return { ok: false, detail: `limit doit être un entier entre 1 et ${maxLimit}.` }
    numItems = n
  }
  let cursor: string | null = null
  if (input.cursor) {
    cursor = decodeCursor(input.cursor)
    if (cursor === null) return { ok: false, detail: "cursor est invalide : reprendre la valeur next_cursor reçue." }
  }
  return { ok: true, paginationOpts: { numItems, cursor } }
}

/** `limit` et `cursor` lus dans l'adresse d'une requête. */
export function pageParams(url: string | URL): { limit: string | null; cursor: string | null } {
  const params = new URL(url).searchParams
  return { limit: params.get("limit"), cursor: params.get("cursor") }
}
