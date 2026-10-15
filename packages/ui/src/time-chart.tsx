import { useState, type KeyboardEvent, type PointerEvent } from "react"

import { areaPath, linePath } from "./chart-path.ts"
import { cn } from "./cn.ts"

export type TimeSeries = {
  /** Identifiant stable : la couleur suit la série, jamais son rang dans un filtre. */
  key: string
  label: string
  /** Une valeur par horodatage de `timestamps` ; `null` : pas de mesure (la ligne s'interrompt). */
  values: Array<number | null>
}

/** Six teintes de la DA (`--chart-1` à `--chart-6`), dans l'ordre, jamais recyclées. */
export const CHART_COLORS: ReadonlyArray<string> = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
]

const number = new Intl.NumberFormat("fr-CH")
const dayMonth = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short" })

/**
 * Un maximum « rond » pour l'axe des valeurs, et ses graduations : 0, 25, 50, 75, 100 plutôt que
 * 0, 23,7, 47,4. `ticks` est le nombre d'intervalles visé.
 */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 }
  const raw = max / ticks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const residual = raw / magnitude
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10
  const step = nice * magnitude
  return { max: Math.ceil(max / step) * step, step }
}

/**
 * Série temporelle en SVG, sans bibliothèque : lignes (aire sous la courbe pour une série seule)
 * ou barres empilées. Le SVG s'étire à la largeur de son conteneur ; les traits gardent 2 px
 * (`non-scaling-stroke`) et les textes restent en HTML, nets à toute taille.
 *
 * Survol ou flèches du clavier : un repère vertical et une infobulle avec chaque valeur. Les
 * lecteurs d'écran ont un tableau des données. Légende dès deux séries.
 */
export function TimeChart({
  timestamps,
  series,
  kind = "line",
  height = 200,
  compact = false,
  label,
  formatValue = (v) => number.format(v),
  formatTime = (t) => dayMonth.format(t),
  emptyLabel = "Aucune donnée sur cette période.",
  lastIncomplete = false,
  className,
}: {
  timestamps: Array<number>
  series: Array<TimeSeries>
  kind?: "line" | "bar"
  /** Hauteur de la zone de tracé, en pixels. */
  height?: number
  /** Sans axes, grille ni légende : la courbe seule, sous un `StatTile`. */
  compact?: boolean
  /** Ce que montre le graphique, pour les lecteurs d'écran : « Envois par jour ». */
  label: string
  formatValue?: (value: number) => string
  formatTime?: (time: number) => string
  emptyLabel?: string
  /**
   * Le dernier point couvre une période pas encore finie (aujourd'hui, ce mois-ci) : sa ligne est
   * en pointillés, sa barre pâlie, et l'infobulle le dit. Sans cela, une chute du dernier jour
   * se lit comme une baisse alors que la journée n'est pas terminée.
   */
  lastIncomplete?: boolean
  className?: string
}): React.JSX.Element {
  const [active, setActive] = useState<number | null>(null)
  const n = timestamps.length
  const hasData = n > 0 && series.some((s) => s.values.some((v) => v !== null))

  if (!hasData)
    return (
      <div
        data-slot="time-chart"
        data-state="empty"
        style={{ height }}
        className={cn(
          "grid place-items-center rounded-2xl bg-foreground/[0.03] text-sm text-muted-foreground",
          className,
        )}
      >
        {emptyLabel}
      </div>
    )

  const totals = timestamps.map((_, i) =>
    kind === "bar"
      ? series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)
      : Math.max(0, ...series.map((s) => s.values[i] ?? 0)),
  )
  const scale = niceScale(Math.max(0, ...totals))
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, i) => i * scale.step)
  const color = (index: number) => CHART_COLORS[index % CHART_COLORS.length] ?? "currentColor"

  const indexFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    return Math.min(n - 1, Math.max(0, Math.floor(ratio * n)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n }
    if (event.key === "Escape") return setActive(null)
    const move = moves[event.key]
    if (move === undefined) return
    event.preventDefault()
    setActive((current) => Math.min(n - 1, Math.max(0, (current ?? (move > 0 ? -1 : n)) + move)))
  }

  const incompleteIndex = lastIncomplete && n > 1 ? n - 1 : -1
  const activeTime = active !== null ? timestamps[active] : undefined
  const describe = (i: number) => {
    const t = timestamps[i]
    const values = series
      .map((s) => `${s.label} ${s.values[i] == null ? "pas de mesure" : formatValue(s.values[i] ?? 0)}`)
      .join(", ")
    const time = t === undefined ? "" : `${formatTime(t)}${i === incompleteIndex ? " (en cours)" : ""} : `
    return `${time}${values}`
  }
  const xLabels = compact ? [] : [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <figure data-slot="time-chart" className={cn("grid gap-3", className)}>
      {!compact && series.length > 1 ? (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color(i) }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}

      <div className={cn("grid", !compact && "grid-cols-[auto_minmax(0,1fr)] gap-x-2")}>
        {!compact ? (
          <div
            aria-hidden
            className="relative w-10 text-right text-[11px] text-muted-foreground tabular-nums"
            style={{ height }}
          >
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2"
                style={{ top: `${100 - (t / scale.max) * 100}%` }}
              >
                {formatValue(t)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <div
            // Un curseur sur le temps : les flèches le déplacent d'un point, et chaque position se
            // lit en entier (date et valeurs).
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={active ?? n - 1}
            aria-valuetext={describe(active ?? n - 1)}
            onPointerMove={(event) => setActive(indexFromPointer(event))}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            style={{ height }}
          >
            <svg
              viewBox={`0 0 ${n} 100`}
              preserveAspectRatio="none"
              aria-hidden
              className="absolute inset-0 size-full overflow-visible"
            >
              {!compact
                ? ticks.map((t) => (
                    <line
                      key={t}
                      x1={0}
                      x2={n}
                      y1={100 - (t / scale.max) * 100}
                      y2={100 - (t / scale.max) * 100}
                      vectorEffect="non-scaling-stroke"
                      className={t === 0 ? "stroke-foreground/15" : "stroke-foreground/[0.06]"}
                      strokeWidth={1}
                    />
                  ))
                : null}

              {kind === "bar"
                ? timestamps.map((_, i) => {
                    let base = 100
                    return series.map((s, si) => {
                      const v = s.values[i] ?? 0
                      const h = (v / scale.max) * 100
                      base -= h
                      return v > 0 ? (
                        <rect
                          key={`${s.key}-${i}`}
                          x={i + 0.15}
                          y={base}
                          width={0.7}
                          height={h}
                          fill={color(si)}
                          opacity={(active === null || active === i ? 1 : 0.55) * (i === incompleteIndex ? 0.5 : 1)}
                        />
                      ) : null
                    })
                  })
                : series.map((s, si) => (
                    <g key={s.key}>
                      {series.length === 1 ? (
                        <path d={areaPath(s.values, scale.max)} fill={color(si)} opacity={0.1} />
                      ) : null}
                      <path
                        d={linePath(
                          incompleteIndex < 0 ? s.values : s.values.map((v, i) => (i === incompleteIndex ? null : v)),
                          scale.max,
                        )}
                        fill="none"
                        stroke={color(si)}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {incompleteIndex >= 0 ? (
                        <path
                          data-slot="time-chart-incomplete"
                          d={linePath(
                            s.values.map((v, i) => (i >= incompleteIndex - 1 ? v : null)),
                            scale.max,
                          )}
                          fill="none"
                          stroke={color(si)}
                          strokeWidth={2}
                          strokeDasharray="3 4"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                    </g>
                  ))}

              {active !== null ? (
                <line
                  x1={active + 0.5}
                  x2={active + 0.5}
                  y1={0}
                  y2={100}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-foreground/25"
                  strokeWidth={1}
                />
              ) : null}
            </svg>

            {active !== null && activeTime !== undefined ? (
              <div
                data-slot="time-chart-tooltip"
                className={cn(
                  "pointer-events-none absolute top-0 z-10 grid min-w-36 gap-1 rounded-xl bg-popover px-3 py-2 text-xs shadow-lg shadow-black/10 [--popover:var(--floating)]",
                  (active + 0.5) / n > 0.6 ? "-translate-x-[calc(100%+0.75rem)]" : "translate-x-3",
                )}
                style={{ left: `${((active + 0.5) / n) * 100}%` }}
              >
                <p className="font-medium">
                  {formatTime(activeTime)}
                  {active === incompleteIndex ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">En cours</span>
                  ) : null}
                </p>
                {series.map((s, si) => (
                  <p key={s.key} className="flex items-center gap-2">
                    <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: color(si) }} />
                    <span className="flex-1 text-muted-foreground">{s.label}</span>
                    <span className="font-medium tabular-nums">
                      {s.values[active] === null ? "-" : formatValue(s.values[active] ?? 0)}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          {xLabels.length > 0 ? (
            <div aria-hidden className="relative h-4 text-[11px] text-muted-foreground tabular-nums">
              {xLabels.map((i, k) => (
                <span
                  key={i}
                  className={cn(
                    "absolute",
                    k === 0 ? "left-0" : k === xLabels.length - 1 ? "right-0" : "-translate-x-1/2",
                  )}
                  style={k === 0 || k === xLabels.length - 1 ? undefined : { left: `${((i + 0.5) / n) * 100}%` }}
                >
                  {timestamps[i] !== undefined ? formatTime(timestamps[i]) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timestamps.map((t, i) => (
            <tr key={t}>
              <th scope="row">
                {formatTime(t)}
                {i === incompleteIndex ? " (en cours)" : ""}
              </th>
              {series.map((s) => (
                <td key={s.key}>{s.values[i] === null ? "-" : formatValue(s.values[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
