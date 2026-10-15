import { useRender } from "@base-ui/react/use-render"
import type { ReactElement, ReactNode } from "react"

import { cn } from "./cn.ts"

export type RankItem = {
  /** Identifiant stable de la ligne. */
  key: string
  label: ReactNode
  value: number
  /** Icône ou pastille avant le libellé (drapeau, favicon), décorative. */
  icon?: ReactNode
  /** La ligne mène au détail : `<Link to="…" />` ou `<a href="…" />`. */
  render?: ReactElement
}

const number = new Intl.NumberFormat("fr-CH")

function RankRow({
  item,
  max,
  formatValue,
}: {
  item: RankItem
  max: number
  formatValue: (value: number) => string
}): React.JSX.Element {
  const width = max > 0 ? Math.max(0, Math.min(1, item.value / max)) : 0
  const content = (
    <>
      {/* La barre est derrière le texte : sa longueur se lit, sa valeur s'écrit à droite. */}
      <span
        aria-hidden
        data-slot="rank-bar-fill"
        className="absolute inset-y-0 left-0 rounded-lg bg-foreground/[0.06] transition-[width] duration-(--duration-base) ease-out"
        style={{ width: `${width * 100}%` }}
      />
      <span className="relative flex min-w-0 flex-1 items-center gap-2">
        {item.icon ? (
          <span aria-hidden className="grid size-4 shrink-0 place-items-center">
            {item.icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{item.label}</span>
      </span>
      <span className="relative shrink-0 font-medium tabular-nums">{formatValue(item.value)}</span>
    </>
  )
  const row = "relative flex min-h-9 items-center gap-3 rounded-lg px-2.5 text-sm"
  const link = useRender({
    render: item.render,
    enabled: item.render !== undefined,
    props: {
      className: cn(
        row,
        "outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50",
      ),
      children: content,
    },
  })
  return <li>{link ?? <div className={row}>{content}</div>}</li>
}

/**
 * Classement d'un tableau de bord : pages les plus vues, domaines qui envoient le plus, pays.
 * Une ligne par élément, triée du plus grand au plus petit, sa barre proportionnelle au premier.
 * Une liste ordonnée : le rang se lit sans la barre, et chaque valeur s'écrit.
 */
export function RankBar({
  label,
  items,
  limit,
  formatValue = (v) => number.format(v),
  valueLabel,
  emptyLabel = "Rien à classer sur cette période.",
  className,
}: {
  /** Nom de la liste pour les lecteurs d'écran : « Pages les plus vues ». */
  label: string
  items: ReadonlyArray<RankItem>
  /** Nombre de lignes affichées ; le reste n'est pas rendu (le produit offre « Tout voir »). */
  limit?: number
  formatValue?: (value: number) => string
  /** En-tête de la colonne des valeurs, visible : « Visites ». */
  valueLabel?: ReactNode
  emptyLabel?: ReactNode
  className?: string
}): React.JSX.Element {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const shown = limit === undefined ? sorted : sorted.slice(0, limit)
  const max = shown[0]?.value ?? 0

  if (shown.length === 0)
    return (
      <p
        data-slot="rank-bar"
        data-state="empty"
        className={cn("py-6 text-center text-sm text-muted-foreground", className)}
      >
        {emptyLabel}
      </p>
    )

  return (
    <div data-slot="rank-bar" className={cn("grid gap-1", className)}>
      {valueLabel ? (
        <p aria-hidden className="flex justify-end px-2.5 text-xs text-muted-foreground">
          {valueLabel}
        </p>
      ) : null}
      <ol aria-label={label} className="grid gap-1">
        {shown.map((item) => (
          <RankRow key={item.key} item={item} max={max} formatValue={formatValue} />
        ))}
      </ol>
    </div>
  )
}
