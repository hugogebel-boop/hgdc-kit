import { useCallback, useState } from "react"

/** La règle commune des grandes listes : 200 lignes par page. */
export const PAGE_SIZE = 200

/** Ce que renvoie `paginate` de Convex (`PaginationResult`), réduit à ce dont la pile a besoin. */
export type CursorPageResult<Item = unknown> = {
  page: ReadonlyArray<Item>
  isDone: boolean
  continueCursor: string
}

/**
 * Pile des curseurs : `cursors[i]` ouvre la page `i` (`null` pour la première), `offsets[i]` compte
 * les lignes des pages d'avant. La page `i + 1`, si elle est connue, borne la page `i` : revenir en
 * arrière relit exactement les mêmes lignes, sans perte ni doublon, même si la liste bouge.
 */
export type CursorStack = {
  index: number
  cursors: ReadonlyArray<string | null>
  offsets: ReadonlyArray<number>
}

export const FIRST_PAGE: CursorStack = { index: 0, cursors: [null], offsets: [0] }

/** Page suivante, depuis le résultat de la page `from` ; rien ne change si l'on n'y est plus (double clic) ou si la liste est finie. */
export function nextPage(stack: CursorStack, from: number, result: CursorPageResult): CursorStack {
  if (stack.index !== from || result.isDone) return stack
  const to = from + 1
  if (stack.cursors.length > to) return { ...stack, index: to }
  return {
    index: to,
    cursors: [...stack.cursors, result.continueCursor],
    offsets: [...stack.offsets, (stack.offsets[from] ?? 0) + result.page.length],
  }
}

/** Page précédente ; rien ne change sur la première. */
export function previousPage(stack: CursorStack, from: number): CursorStack {
  if (stack.index !== from || from === 0) return stack
  return { ...stack, index: from - 1 }
}

/** Options à passer telles quelles à une query Convex qui reçoit `paginationOptsValidator`. */
export type CursorPaginationOpts = { numItems: number; cursor: string | null; endCursor?: string }

export type CursorPages = {
  pageSize: number
  /** Page affichée, à partir de 0. */
  pageIndex: number
  /** Lignes des pages d'avant : la page commence à la ligne `offset + 1`. */
  offset: number
  cursor: string | null
  /** Fin de la page quand la suivante a déjà été ouverte. */
  endCursor: string | null
  paginationOpts: CursorPaginationOpts
  hasPrevious: boolean
  /** À appeler avec le résultat de la page affichée. */
  next: (result: CursorPageResult) => void
  previous: () => void
  /** Retour à la première page. */
  reset: () => void
}

/**
 * Pagination par curseur, page par page (Précédent, Suivant), pour une liste paginée côté serveur.
 * Indépendant de Convex, mais calé sur `paginate({ numItems, cursor, endCursor })` et son résultat
 * `{ page, isDone, continueCursor }` : `paginationOpts` se passe à la query, le résultat à `next`.
 *
 * `filtersKey` résume les filtres (période, statut, recherche, tri) : quand elle change, la liste
 * revient à la première page, puisque les curseurs d'avant ne valent plus rien.
 */
export function useCursorPages(filtersKey: string, { pageSize = PAGE_SIZE }: { pageSize?: number } = {}): CursorPages {
  const [state, setState] = useState<{ key: string; stack: CursorStack }>({ key: filtersKey, stack: FIRST_PAGE })
  // Retour au début pendant le rendu même : aucune requête ne part avec un curseur d'un autre filtre.
  const stack = state.key === filtersKey ? state.stack : FIRST_PAGE
  if (state.key !== filtersKey) setState({ key: filtersKey, stack: FIRST_PAGE })

  const index = stack.index
  const next = useCallback(
    (result: CursorPageResult) =>
      setState((s) => (s.key === filtersKey ? { key: s.key, stack: nextPage(s.stack, index, result) } : s)),
    [filtersKey, index],
  )
  const previous = useCallback(
    () => setState((s) => (s.key === filtersKey ? { key: s.key, stack: previousPage(s.stack, index) } : s)),
    [filtersKey, index],
  )
  const reset = useCallback(() => setState({ key: filtersKey, stack: FIRST_PAGE }), [filtersKey])

  const cursor = stack.cursors[index] ?? null
  const endCursor = stack.cursors[index + 1] ?? null
  return {
    pageSize,
    pageIndex: index,
    offset: stack.offsets[index] ?? 0,
    cursor,
    endCursor,
    paginationOpts: endCursor === null ? { numItems: pageSize, cursor } : { numItems: pageSize, cursor, endCursor },
    hasPrevious: index > 0,
    next,
    previous,
    reset,
  }
}
