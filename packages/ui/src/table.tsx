import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import ArrowUp01Icon from "@hugeicons/core-free-icons/ArrowUp01Icon"
import ArrowUpDownIcon from "@hugeicons/core-free-icons/ArrowUpDownIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import type { ReactNode } from "react"

import { cn } from "./cn.ts"
import { Skeleton } from "./skeleton.tsx"

/**
 * Tableau de données. Posé sur une carte `surface` par défaut (`surface={false}` dans une carte
 * qui en a déjà une), il défile horizontalement dans son cadre sur téléphone : la page, elle,
 * ne défile jamais de côté.
 */
function Table({
  className,
  surface = true,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { surface?: boolean; containerClassName?: string }): React.JSX.Element {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", surface && "surface rounded-3xl", containerClassName)}
    >
      <table data-slot="table" className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">): React.JSX.Element {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">): React.JSX.Element {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

/**
 * Une ligne. Avec un `TableRowLink` dedans, toute la ligne devient cliquable : survol teinté,
 * lien étiré sur la ligne. Le lien reste un vrai lien (Tab, Entrée, clic milieu, « ouvrir dans
 * un nouvel onglet »), là où un `onClick` sur `<tr>` n'en offrirait aucun.
 */
function TableRow({ className, ...props }: React.ComponentProps<"tr">): React.JSX.Element {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "relative border-t border-foreground/5 transition-colors duration-(--duration-fast) ease-out",
        "[[data-slot=table-header]_&]:border-t-0",
        "has-data-[slot=table-row-link]:hover:bg-foreground/[0.03] has-data-[slot=table-row-link]:has-focus-visible:bg-foreground/[0.03]",
        "data-[state=selected]:bg-foreground/[0.04]",
        className,
      )}
      {...props}
    />
  )
}

export type SortDirection = "ascending" | "descending" | "none"

/**
 * En-tête de colonne. Triable avec `onSort` : un bouton, l'état dans `aria-sort` (lu par les
 * lecteurs d'écran) et une flèche. Le tri lui-même reste au produit, idéalement dans l'URL.
 */
function TableHead({
  className,
  children,
  sort,
  onSort,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & {
  sort?: SortDirection
  onSort?: () => void
  /** Colonne de chiffres : alignée à droite, chiffres de largeur fixe. */
  numeric?: boolean
}): React.JSX.Element {
  const sortable = onSort !== undefined
  const direction = sort ?? "none"
  return (
    <th
      data-slot="table-head"
      scope="col"
      aria-sort={sortable ? direction : undefined}
      className={cn(
        "h-11 px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5",
        numeric && "text-right",
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none transition-colors duration-(--duration-fast) ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            direction !== "none" && "text-foreground",
          )}
        >
          {children}
          <HugeiconsIcon
            icon={
              direction === "ascending" ? ArrowUp01Icon : direction === "descending" ? ArrowDown01Icon : ArrowUpDownIcon
            }
            strokeWidth={2}
            aria-hidden
            className={cn("size-3.5 shrink-0", direction === "none" && "opacity-50")}
          />
        </button>
      ) : (
        children
      )}
    </th>
  )
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }): React.JSX.Element {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle first:pl-5 last:pr-5",
        numeric && "text-right tabular-nums",
        // Un bouton ou un menu dans une ligne cliquable passe au-dessus du lien étiré.
        "[&_a:not([data-slot=table-row-link])]:relative [&_a:not([data-slot=table-row-link])]:z-1 [&_button]:relative [&_button]:z-1",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Le lien d'une ligne, dans sa première cellule : son libellé est le nom de la ressource, et son
 * pseudo-élément couvre toute la ligne. `render={<Link to="…" />}` pour le routeur du produit.
 */
function TableRowLink({ className, render, ...props }: useRender.ComponentProps<"a">): React.JSX.Element {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        "data-slot": "table-row-link",
        className: cn(
          "font-medium outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset",
          className,
        ),
      } as React.ComponentProps<"a">,
      props,
    ),
  })
}

/** Aucune ligne : une phrase, et de quoi en créer une. Occupe toute la largeur du tableau. */
function TableEmpty({
  colSpan,
  children,
  className,
}: {
  colSpan: number
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <tr data-slot="table-empty">
      <td colSpan={colSpan} className={cn("px-5 py-12 text-center text-sm text-muted-foreground", className)}>
        {children}
      </td>
    </tr>
  )
}

/** Lignes de chargement à la forme des vraies : même hauteur, même nombre de colonnes. */
function TableSkeleton({ rows = 5, columns }: { rows?: number; columns: number }): React.JSX.Element {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} data-slot="table-skeleton" aria-hidden className="border-t border-foreground/5">
          {Array.from({ length: columns }, (_, col) => (
            <td key={col} className="px-4 py-3 first:pl-5 last:pr-5">
              <Skeleton className={cn("h-4 rounded-md", col === 0 ? "w-3/4" : "w-1/2")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowLink, TableEmpty, TableSkeleton }
