import type { ReactNode } from "react"

import { RelativeTime } from "./relative-time.tsx"
import { StatusDot, type ServiceStatus } from "./status.tsx"
import { cn } from "./cn.ts"

export type TimelineEntry = {
  id: string
  /** « Identifié », « Correctif déployé », « Résolu ». */
  title: ReactNode
  description?: ReactNode
  /** Instant de l'étape, affiché en relatif avec la date exacte au survol. */
  time: number | Date
  /** Couleur du point ; sans statut, un point neutre. */
  status?: ServiceStatus
}

/**
 * Historique d'un incident, d'un envoi, d'un déploiement : une étape par ligne, reliées par un
 * fil. Le produit les passe dans l'ordre voulu (le plus récent d'abord, d'habitude).
 */
export function Timeline({
  entries,
  now,
  className,
}: {
  entries: Array<TimelineEntry>
  now?: number
  className?: string
}): React.JSX.Element {
  return (
    <ol data-slot="timeline" className={cn("grid", className)}>
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0">
          {index < entries.length - 1 ? (
            <span aria-hidden className="absolute top-5 bottom-0 left-[calc(0.5rem-0.5px)] w-px bg-foreground/10" />
          ) : null}
          <span className="flex h-5 items-center justify-center">
            {entry.status ? (
              <StatusDot status={entry.status} className="size-2.5" />
            ) : (
              <span aria-hidden className="size-2.5 rounded-full bg-foreground/20" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="text-sm font-medium">{entry.title}</p>
              <span className="text-xs text-muted-foreground">
                <RelativeTime date={entry.time} {...(now !== undefined ? { now } : {})} />
              </span>
            </div>
            {entry.description ? <div className="mt-1 text-sm text-muted-foreground">{entry.description}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
