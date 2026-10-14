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

/**
 * Une barre par jour, du plus ancien au plus récent, comme les pages de statut de référence.
 * Chaque barre a sa couleur et, au survol, une infobulle en texte (jour, statut, disponibilité,
 * note). Les lecteurs d'écran lisent la liste des jours, dont chacun dit son statut en mots.
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
  return (
    <div data-slot="uptime-bar" className={cn("grid gap-2", className)}>
      <ol aria-label={label} className="flex h-8 items-stretch gap-[2px]">
        {days.map((entry) => (
          <li key={new Date(entry.date).toISOString()} className="flex min-w-0 flex-1">
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className={cn(
                  "block w-full rounded-[3px] transition-opacity duration-(--duration-fast) ease-out hover:opacity-70 data-popup-open:opacity-70",
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
      <div aria-hidden className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{days.length > 0 ? `il y a ${days.length} jours` : null}</span>
        {summary ? <span className="text-foreground">{summary}</span> : null}
        <span>Aujourd'hui</span>
      </div>
    </div>
  )
}
