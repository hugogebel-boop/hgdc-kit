import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

import { Button } from "./button.tsx"
import { cn } from "./cn.ts"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  type SortDirection,
} from "./table.tsx"

export type DataTableSort = { key: string; direction: Exclude<SortDirection, "none"> }

export type DataTableColumn<Row> = {
  /** Identifiant de la colonne, et clé du tri dans l'URL. */
  key: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  /** Chiffres alignés à droite, en `tabular-nums`. */
  numeric?: boolean
  /** Triable : l'en-tête devient un bouton. */
  sortable?: boolean
  /** Sens du premier clic : `descending` pour une date ou un volume, `ascending` pour un nom. */
  firstDirection?: DataTableSort["direction"]
  className?: string
  headClassName?: string
}

/**
 * Le tri après un clic sur une colonne : une nouvelle colonne part dans son sens premier, la
 * colonne déjà triée change de sens.
 */
export function nextSort(
  current: DataTableSort | null | undefined,
  key: string,
  firstDirection: DataTableSort["direction"] = "ascending",
): DataTableSort {
  if (current?.key !== key) return { key, direction: firstDirection }
  return { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
}

function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}): React.JSX.Element {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-1 text-sm">
      <p className="text-muted-foreground tabular-nums" aria-live="polite">
        Page {page} sur {Math.max(pageCount, 1)}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden data-icon="inline-start" />
          Précédente
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Suivante
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}

/**
 * Une liste de ressources en tableau, avec ses filtres, son tri et sa pagination, tous contrôlés :
 * l'état vit dans l'URL du produit (tri, page, filtres), le tableau ne fait que l'afficher et
 * rappeler. Construit sur `table` ; pour une mise en page à part, les pièces de `table` restent
 * disponibles.
 *
 * `rows` à `undefined` : chargement, des lignes squelettes à la forme des vraies. `error` remplace
 * le tableau (un `ErrorCard`). Aucune ligne : `empty`, ou `filteredEmpty` quand des filtres sont
 * posés, pour dire que c'est la recherche qui ne trouve rien.
 *
 * Deux paginations : `pagination` (pages numérotées) ou `loadMore` (« Charger plus », comme
 * `usePaginatedQuery` de Convex).
 */
export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  label,
  sort,
  onSortChange,
  filters,
  filtered = false,
  empty = "Rien pour l'instant.",
  filteredEmpty = "Aucun résultat pour ces filtres.",
  error,
  pagination,
  loadMore,
  skeletonRows = 5,
  surface = true,
  className,
}: {
  /** `undefined` pendant le chargement. */
  rows: ReadonlyArray<Row> | undefined
  columns: ReadonlyArray<DataTableColumn<Row>>
  rowKey: (row: Row) => string
  /** Nom du tableau pour les lecteurs d'écran : « Déploiements ». */
  label: string
  sort?: DataTableSort | null
  onSortChange?: (sort: DataTableSort) => void
  /** Au-dessus du tableau : un `FilterBar`. */
  filters?: ReactNode
  /** Des filtres sont posés : l'état vide le dit. */
  filtered?: boolean
  empty?: ReactNode
  filteredEmpty?: ReactNode
  /** À la place du tableau quand le chargement a échoué. */
  error?: ReactNode
  pagination?: { page: number; pageCount: number; onPageChange: (page: number) => void }
  loadMore?: { hasMore: boolean; onLoadMore: () => void; loading?: boolean; label?: string }
  skeletonRows?: number
  surface?: boolean
  className?: string
}): React.JSX.Element {
  const failed = error !== undefined && error !== null && error !== false
  const showPagination = pagination !== undefined && rows !== undefined && pagination.pageCount > 1
  const showLoadMore = loadMore !== undefined && rows !== undefined && (loadMore.hasMore || loadMore.loading === true)

  return (
    <div data-slot="data-table" className={cn("grid gap-3", className)}>
      {filters}
      {failed ? (
        error
      ) : (
        <Table aria-label={label} aria-busy={rows === undefined || undefined} surface={surface}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const direction = sort?.key === column.key ? sort.direction : "none"
                return (
                  <TableHead
                    key={column.key}
                    numeric={column.numeric ?? false}
                    className={column.headClassName}
                    {...(column.sortable && onSortChange
                      ? {
                          sort: direction,
                          onSort: () => onSortChange(nextSort(sort, column.key, column.firstDirection)),
                        }
                      : {})}
                  >
                    {column.header}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableSkeleton rows={skeletonRows} columns={columns.length} />
            ) : rows.length === 0 ? (
              <TableEmpty colSpan={columns.length}>{filtered ? filteredEmpty : empty}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} numeric={column.numeric ?? false} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
      {!failed && showPagination ? <Pagination {...pagination} /> : null}
      {!failed && showLoadMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            isLoading={loadMore.loading === true}
            disabled={!loadMore.hasMore}
            onClick={loadMore.onLoadMore}
          >
            {loadMore.label ?? "Charger plus"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
