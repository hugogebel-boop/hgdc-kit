import { cn } from "./cn.ts"

/** Disponibilité d'un service, vocabulaire fermé de la famille (Status, Host, Mail). */
export type ServiceStatus = "operational" | "degraded" | "outage" | "maintenance" | "unknown"

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  operational: "Opérationnel",
  degraded: "Dégradé",
  outage: "Panne",
  maintenance: "Maintenance",
  unknown: "Inconnu",
}

const DOT: Record<ServiceStatus, string> = {
  operational: "bg-status-operational",
  degraded: "bg-status-degraded",
  outage: "bg-status-outage",
  maintenance: "bg-status-maintenance",
  unknown: "bg-status-unknown",
}

const BADGE: Record<ServiceStatus, string> = {
  operational: "bg-status-operational/12 text-status-operational-ink",
  degraded: "bg-status-degraded/15 text-status-degraded-ink",
  outage: "bg-status-outage/10 text-status-outage-ink",
  maintenance: "bg-status-maintenance/12 text-status-maintenance-ink",
  unknown: "bg-foreground/[0.06] text-status-unknown-ink",
}

/**
 * Le point d'un statut, décoratif (`aria-hidden`) : il accompagne toujours un libellé.
 * `live` ajoute l'anneau qui s'élargit, pour ce qui est en cours (incident, vérification DNS).
 */
export function StatusDot({
  status,
  live = false,
  className,
}: {
  status: ServiceStatus
  live?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span aria-hidden data-slot="status-dot" className={cn("relative inline-flex size-2 shrink-0", className)}>
      {live ? <span className={cn("absolute inset-0 live-ping rounded-full", DOT[status])} /> : null}
      <span className={cn("relative inline-flex size-full rounded-full", DOT[status])} />
    </span>
  )
}

/**
 * Un statut : point et libellé, jamais la couleur seule. Le libellé par défaut est celui de la
 * famille ; un produit peut le préciser (« Panne partielle ») sans changer de couleur.
 */
export function StatusBadge({
  status,
  label,
  live = false,
  className,
}: {
  status: ServiceStatus
  label?: string
  live?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE[status],
        className,
      )}
    >
      <StatusDot status={status} live={live} className="size-1.5" />
      {label ?? SERVICE_STATUS_LABEL[status]}
    </span>
  )
}
