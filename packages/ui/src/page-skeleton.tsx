import { cn } from "./cn.ts"
import { Skeleton } from "./skeleton.tsx"

/**
 * La forme d'une page qui charge, dans la coque. Elle reprend la mise en page de `Page`
 * (`@hgdc/ui/page-header`) : en-tête de la même hauteur, même colonne, même espacement, pour que
 * rien ne saute quand la page arrive (ADR 0025).
 *
 * - `list` : un tableau ou une liste (par défaut) ;
 * - `dashboard` : des chiffres en tête, un graphique, une liste ;
 * - `form` : des réglages ou une fiche, dans la colonne de lecture.
 */
export type PageSkeletonVariant = "list" | "dashboard" | "form"

export function PageSkeleton({
  variant = "list",
  label = "Chargement…",
  className,
}: {
  variant?: PageSkeletonVariant
  /** Annoncé aux lecteurs d'écran. */
  label?: string
  className?: string
}): React.JSX.Element {
  return (
    <div
      data-slot="page-skeleton"
      data-variant={variant}
      role="status"
      aria-label={label}
      className={cn("w-full", variant === "form" && "max-w-3xl", className)}
    >
      <div data-slot="page-header" className="mb-8 grid gap-3">
        <div className="min-w-0">
          {/* Hauteur de ligne du titre de `PageHeader` (28 px, 37 px de ligne). */}
          <Skeleton className="h-9 w-56 max-w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full rounded-md" />
        </div>
      </div>
      <div className="grid gap-6">{BODIES[variant]}</div>
    </div>
  )
}

function Rows({ count }: { count: number }): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-foreground/5 px-4 py-3 last:border-b-0">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Skeleton className="h-4 w-2/5 rounded-md" />
            <Skeleton className="h-3 w-1/4 rounded-md" />
          </div>
          <Skeleton className="hidden h-6 w-16 rounded-full sm:block" />
        </div>
      ))}
    </div>
  )
}

const BODIES: Record<PageSkeletonVariant, React.JSX.Element> = {
  list: (
    <>
      <Skeleton className="h-10 w-full max-w-md" />
      <Rows count={6} />
    </>
  ),
  dashboard: (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Rows count={4} />
    </>
  ),
  form: (
    <>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="grid gap-4 rounded-2xl border border-foreground/5 p-6">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ))}
    </>
  ),
}
