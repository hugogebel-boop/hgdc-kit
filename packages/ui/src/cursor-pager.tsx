import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import type { RefObject } from "react"

import { Button } from "./button.tsx"
import { cn } from "./cn.ts"
import type { CursorPageResult, CursorPages } from "./cursor-pages.ts"
import { Spinner } from "./spinner.tsx"

const NUMBER = new Intl.NumberFormat("fr-CH")

/** « Lignes 201 à 400 », « 1 ligne », « 37 lignes ». */
export function rangeLabel(offset: number, count: number, single: boolean): string {
  if (single) return `${NUMBER.format(count)} ${count > 1 ? "lignes" : "ligne"}`
  return `Lignes ${NUMBER.format(offset + 1)} à ${NUMBER.format(offset + count)}`
}

/**
 * Navigation d'une liste paginée par curseur (`useCursorPages`) : Précédent, Suivant et les lignes
 * affichées. Sous le tableau ou le journal, à la place de `pagination` ou `loadMore` de `DataTable`.
 *
 * `result` à `undefined` pendant le chargement : la barre garde sa hauteur, les boutons sont
 * désactivés, « Chargement… » remplace le décompte. Une seule page : le décompte seul. Aucune
 * ligne sur la première page : rien, l'état vide de la liste suffit.
 *
 * `scrollTarget` : le haut de la liste, ramené à l'écran à chaque changement de page.
 */
export function CursorPager({
  pages,
  result,
  scrollTarget,
  label = "Pagination",
  className,
}: {
  pages: CursorPages
  result: CursorPageResult | undefined
  scrollTarget?: RefObject<HTMLElement | null>
  /** Nom de la navigation pour les lecteurs d'écran : « Pagination des appels ». */
  label?: string
  className?: string
}): React.JSX.Element | null {
  const loading = result === undefined
  const count = result?.page.length ?? 0
  const hasNext = result !== undefined && !result.isDone
  const single = !pages.hasPrevious && result?.isDone === true
  if (!loading && count === 0 && !pages.hasPrevious) return null

  const go = (move: () => void): void => {
    move()
    scrollTarget?.current?.scrollIntoView({ block: "start" })
  }

  return (
    <nav
      aria-label={label}
      aria-busy={loading || undefined}
      data-slot="cursor-pager"
      className={cn("flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 text-sm", className)}
    >
      <p className="flex items-center gap-2 text-muted-foreground tabular-nums" aria-live="polite">
        {loading ? <Spinner label="Chargement…" /> : rangeLabel(pages.offset, count, single)}
      </p>
      {single ? null : (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!pages.hasPrevious || loading}
            onClick={() => go(pages.previous)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden data-icon="inline-start" />
            Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => {
              if (result !== undefined) go(() => pages.next(result))
            }}
          >
            Suivant
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden data-icon="inline-end" />
          </Button>
        </div>
      )}
    </nav>
  )
}
