import { useRef, useState, type KeyboardEvent } from "react"

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover.tsx"
import { SERVICE_STATUS_LABEL, StatusDot, type ServiceStatus } from "./status.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { cn } from "./cn.ts"

export type UptimeDay = {
  /** Le jour, en millisecondes ou en `Date`. */
  date: number | Date
  /** Le pire statut du jour. `unknown` : pas de mesure (service plus récent que la période). */
  status: ServiceStatus
  /** Disponibilité du jour, déjà formatée : « 99,98 % ». */
  uptime?: string
  /** Ce qui s'est passé : « Panne de 12 min, base de données ». Ignoré quand `detail` est là. */
  note?: string
  /**
   * Détail du jour, comme chez Statuspage : durée par niveau et incidents en liens. Le jour ouvre
   * alors une bulle (survol, toucher, Entrée) dont les liens se suivent au clavier, au lieu de
   * l'infobulle en texte.
   */
  detail?: UptimeDayDetail
}

export type UptimeDayDetail = {
  /** Temps passé à chaque niveau, du plus grave au moins grave : « Panne majeure », « 12 min ». */
  levels: Array<{ status: ServiceStatus; label: string; duration: string }>
  /** Incidents du jour, vers leur page. */
  incidents: Array<{ title: string; href: string }>
  /** Phrase quand `levels` est vide : « Aucune panne ce jour-là » par défaut. */
  empty?: string
}

const NO_DOWNTIME = "Aucune panne ce jour-là"

const BAR: Record<ServiceStatus, string> = {
  operational: "bg-status-operational",
  degraded: "bg-status-degraded",
  outage: "bg-status-outage",
  maintenance: "bg-status-maintenance",
  unknown: "bg-foreground/10",
}

const DAY =
  "block w-full rounded-[3px] outline-none transition-opacity duration-(--duration-fast) ease-out hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-popup-open:opacity-70"

const day = new Intl.DateTimeFormat("fr-CH", { weekday: "short", day: "numeric", month: "short" })
const longDay = new Intl.DateTimeFormat("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

function describe(entry: UptimeDay): string {
  const detail = entry.detail
  const note = detail
    ? [
        ...detail.levels.map((level) => `${level.label} ${level.duration}`),
        ...detail.incidents.map((incident) => incident.title),
      ].join(" · ") ||
      detail.empty ||
      NO_DOWNTIME
    : entry.note
  return [day.format(entry.date), SERVICE_STATUS_LABEL[entry.status], entry.uptime, note].filter(Boolean).join(" · ")
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

/** Bulle d'un jour : date, disponibilité, durée par niveau (point et mots), incidents en liens. */
function DayDetail({ entry, detail }: { entry: UptimeDay; detail: UptimeDayDetail }): React.JSX.Element {
  return (
    <>
      <div>
        <PopoverTitle className="first-letter:uppercase">{longDay.format(entry.date)}</PopoverTitle>
        {entry.uptime ? <p className="text-xs text-muted-foreground tabular-nums">{entry.uptime}</p> : null}
      </div>
      {detail.levels.length ? (
        <ul className="grid gap-1">
          {detail.levels.map((level) => (
            <li key={level.label} className="flex items-center gap-2">
              <StatusDot status={level.status} />
              <span className="min-w-0 flex-1">{level.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{level.duration}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{detail.empty ?? NO_DOWNTIME}</p>
      )}
      {detail.incidents.length ? (
        <ul aria-label="Incidents du jour" className="grid gap-1.5 border-t border-border pt-2">
          {detail.incidents.map((incident) => (
            <li key={incident.href}>
              <a
                href={incident.href}
                className="rounded-sm font-medium text-pretty underline decoration-muted-foreground/50 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {incident.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

/**
 * Une barre par jour, du plus ancien au plus récent, comme les pages de statut de référence.
 * Chaque barre a sa couleur et, au survol, une infobulle en texte (jour, statut, disponibilité,
 * note). Un jour qui porte un `detail` ouvre à la place une bulle (survol, toucher, Entrée) : durée
 * par niveau et incidents du jour en liens. Les lecteurs d'écran lisent la liste des jours, dont
 * chacun dit son statut en mots.
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
        {days.map((entry, index) => {
          const trigger = {
            render: <button type="button" />,
            "data-slot": "uptime-day",
            tabIndex: index === current ? 0 : -1,
            onFocus: () => setFocused(index),
            onKeyDown,
            className: cn(DAY, BAR[entry.status]),
            children: <span className="sr-only">{describe(entry)}</span>,
          }
          return (
            <li key={new Date(entry.date).toISOString()} className="flex min-w-0 flex-1">
              {entry.detail ? (
                <Popover>
                  <PopoverTrigger openOnHover {...trigger} />
                  <PopoverContent side="top" className="w-64 gap-3" data-slot="uptime-day-detail">
                    <DayDetail entry={entry} detail={entry.detail} />
                  </PopoverContent>
                </Popover>
              ) : (
                <Tooltip>
                  <TooltipTrigger {...trigger} />
                  <TooltipContent>{describe(entry)}</TooltipContent>
                </Tooltip>
              )}
            </li>
          )
        })}
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
