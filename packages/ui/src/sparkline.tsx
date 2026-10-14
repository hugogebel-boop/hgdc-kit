import { areaPath, linePath } from "./chart-path.ts"
import { cn } from "./cn.ts"
import { CHART_COLORS } from "./time-chart.tsx"

const number = new Intl.NumberFormat("fr-CH")

/** Ce que la courbe dit, en une phrase, pour qui ne la voit pas. */
export function describeSparkline(
  label: string,
  values: ReadonlyArray<number | null>,
  format: (value: number) => string = (v) => number.format(v),
): string {
  const known = values.filter((v): v is number => v !== null)
  const last = known.at(-1)
  if (last === undefined) return `${label} : aucune donnée`
  return `${label} : de ${format(Math.min(...known))} à ${format(Math.max(...known))}, dernière valeur ${format(last)}`
}

/**
 * Tendance en un trait, sans axe ni info-bulle, à côté d'un chiffre (ligne de tableau, `StatTile`).
 * L'échelle va du minimum au maximum de la série : c'est la forme qui compte, pas le zéro. Pour lire
 * des valeurs, c'est `TimeChart`. Les lecteurs d'écran entendent l'étendue et la dernière valeur.
 */
export function Sparkline({
  values,
  label,
  color = 1,
  area = true,
  height = 32,
  formatValue,
  className,
}: {
  /** Du plus ancien au plus récent ; `null` : pas de mesure, le trait s'interrompt. */
  values: ReadonlyArray<number | null>
  /** Ce que mesure la courbe : « Envois sur 7 jours ». */
  label: string
  /** Teinte `--chart-1` à `--chart-6`. */
  color?: 1 | 2 | 3 | 4 | 5 | 6
  /** Lavis sous la courbe. */
  area?: boolean
  /** En pixels ; la largeur suit le conteneur. */
  height?: number
  formatValue?: (value: number) => string
  className?: string
}): React.JSX.Element {
  const known = values.filter((v): v is number => v !== null)
  const min = Math.min(...known)
  const max = Math.max(...known)
  const stroke = CHART_COLORS[color - 1] ?? "currentColor"
  const description = describeSparkline(label, values, formatValue)
  // Une série plate se dessine au milieu ; une marge en haut et en bas garde le trait entier.
  const [lo, hi] = max > min ? [min, max] : [min - 1, max + 1]

  return (
    <span
      data-slot="sparkline"
      role="img"
      aria-label={description}
      style={{ height }}
      className={cn("inline-block w-24 min-w-0 align-middle", className)}
    >
      {known.length > 0 ? (
        <svg
          aria-hidden
          viewBox={`0 -6 ${values.length} 112`}
          preserveAspectRatio="none"
          className="block size-full overflow-visible"
        >
          {area ? <path d={areaPath(values, hi, lo)} fill={stroke} opacity={0.12} /> : null}
          <path
            d={linePath(values, hi, lo)}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <span aria-hidden className="flex size-full items-center">
          <span className="h-px w-full bg-foreground/10" />
        </span>
      )}
    </span>
  )
}
