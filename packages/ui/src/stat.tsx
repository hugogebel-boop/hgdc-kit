import ArrowDownRight01Icon from "@hugeicons/core-free-icons/ArrowDownRight01Icon"
import ArrowUpRight01Icon from "@hugeicons/core-free-icons/ArrowUpRight01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

import { cn } from "./cn.ts"

export type StatDelta = {
  /** Déjà formatée : « 12 % », « +340 ». */
  value: string
  direction: "up" | "down" | "flat"
  /**
   * Ce qui est bon pour ce chiffre. Une hausse des erreurs est mauvaise : `good: "down"`.
   * Par défaut, la hausse est bonne.
   */
  good?: "up" | "down"
  /** Période de comparaison : « vs 7 jours précédents ». */
  label?: string
}

const DIRECTION_TEXT = { up: "en hausse de", down: "en baisse de" } as const

/**
 * Une métrique : libellé, valeur en chiffres de largeur fixe, variation. La variation dit son
 * sens par la flèche et par un texte lu aux lecteurs d'écran, pas par la couleur seule.
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  icon,
  className,
  children,
}: {
  label: ReactNode
  value: ReactNode
  delta?: StatDelta
  /** Une précision sous la valeur (« sur 30 jours »). */
  hint?: ReactNode
  icon?: ReactNode
  className?: string
  /** Un petit graphique (`TimeChart` compact) sous la valeur. */
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div data-slot="stat-tile" className={cn("surface flex min-w-0 flex-col gap-2 rounded-3xl p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        {icon ? (
          <span aria-hidden className="text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
      {delta || hint ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta ? <StatDeltaText delta={delta} /> : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function StatDeltaText({ delta }: { delta: StatDelta }): React.JSX.Element {
  const good = delta.good ?? "up"
  const tone =
    delta.direction === "flat"
      ? "text-muted-foreground"
      : delta.direction === good
        ? "text-status-active-ink"
        : "text-destructive"
  return (
    <span
      data-slot="stat-delta"
      data-direction={delta.direction}
      className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", tone)}
    >
      {delta.direction === "flat" ? null : (
        <HugeiconsIcon
          icon={delta.direction === "up" ? ArrowUpRight01Icon : ArrowDownRight01Icon}
          strokeWidth={2}
          aria-hidden
          className="size-3.5"
        />
      )}
      {delta.direction === "flat" ? (
        "Stable"
      ) : (
        <>
          <span className="sr-only">{DIRECTION_TEXT[delta.direction]} </span>
          {delta.value}
        </>
      )}
      {delta.label ? <span className="ml-1 font-normal text-muted-foreground">{delta.label}</span> : null}
    </span>
  )
}

/** Rangée de métriques : une colonne sur téléphone, deux puis quatre en s'élargissant. */
export function StatGrid({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return <div data-slot="stat-grid" className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)} {...props} />
}
