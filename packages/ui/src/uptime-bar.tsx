import { useRef, useState, type KeyboardEvent } from "react"

import { SERVICE_STATUS_LABEL, type ServiceStatus } from "./status.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { cn } from "./cn.ts"

export type UptimeDay = {
  /** Le jour, en millisecondes ou en `Date`. */
  date: number | Date
  /** Le pire statut du jour. `unknown` : pas de mesure (service plus récent que la période). */
  status: ServiceStatus
  /** Disponibilité du jour, déjà formatée : « 99,98 % ». */
  uptime?: string
  /** Ce qui s'est passé : « Panne de 12 min, base de données ». */
  note?: string
}

const BAR: Record<ServiceStatus, string> = {
  operational: "bg-status-operational",
  degraded: "bg-status-degraded",
  outage: "bg-status-outage",
  maintenance: "bg-status-maintenance",
  unknown: "bg-foreground/10",
}

const day = new Intl.DateTimeFormat("fr-CH", { weekday: "short", day: "numeric", month: "short" })

function describe(entry: UptimeDay): string {
  return [day.format(entry.date), SERVICE_STATUS_LABEL[entry.status], entry.uptime, entry.note]
    .filter(Boolean)
    .join(" · ")
}

/** Le jour à atteindre pour une touche, ou `null` si la touche ne déplace pas. */
export function nextDay(key: string, current: number, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, current - 1)
    case "ArrowRight":
      return Math.min(count - 1, current + 1)
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

/**
 * Une barre par jour, du plus ancien au plus récent, comme les pages de statut de référence.
 * Chaque barre a sa couleur et, au survol, une infobulle en texte (jour, statut, disponibilité,
 * note). Les lecteurs d'écran lisent la liste des jours, dont chacun dit son statut en mots.
 *
 * Au clavier, la barre est un seul arrêt de tabulation (le dernier jour visité, aujourd'hui au
 * départ) ; les flèches, Début et Fin passent d'un jour à l'autre et ouvrent son infobulle.
 */
export function UptimeBar({
  days,
  label = "Disponibilité",
  summary,
  className,
}: {
  days: Array<UptimeDay>
  /** Nom de la liste pour les lecteurs d'écran. */
  label?: string
  /** Au centre de la légende : « 99,95 % sur 90 jours ». */
  summary?: string
  className?: string
}): React.JSX.Element {
  const [focused, setFocused] = useState<number | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const current = Math.min(focused ?? days.length - 1, days.length - 1)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const target = nextDay(event.key, current, days.length)
    if (target === null) return
    event.preventDefault()
    setFocused(target)
    list.current?.querySelectorAll<HTMLButtonElement>("[data-slot=uptime-day]")[target]?.focus()
  }

  return (
    <div data-slot="uptime-bar" className={cn("grid gap-2", className)}>
      <ol ref={list} aria-label={label} className="flex h-8 items-stretch gap-[2px]">
        {days.map((entry, index) => (
          <li key={new Date(entry.date).toISOString()} className="flex min-w-0 flex-1">
            <Tooltip>
              <TooltipTrigger
                render={<button type="button" />}
                data-slot="uptime-day"
                tabIndex={index === current ? 0 : -1}
                onFocus={() => setFocused(index)}
                onKeyDown={onKeyDown}
                className={cn(
                  "block w-full rounded-[3px] outline-none transition-opacity duration-(--duration-fast) ease-out hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-popup-open:opacity-70",
                  BAR[entry.status],
                )}
              >
                <span className="sr-only">{describe(entry)}</span>
              </TooltipTrigger>
              <TooltipContent>{describe(entry)}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ol>
      {/* Passe à la ligne sur un téléphone : un résumé long ne déborde pas à 360 px. */}
      <div
        aria-hidden
        data-slot="uptime-legend"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums"
      >
        <span className="shrink-0">{days.length > 0 ? `il y a ${days.length} jours` : null}</span>
        {summary ? (
          <span className="min-w-0 text-center text-pretty break-words text-foreground">{summary}</span>
        ) : null}
        <span className="shrink-0">Aujourd'hui</span>
      </div>
    </div>
  )
}
