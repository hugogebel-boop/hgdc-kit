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
 * Ton d'un statut quelconque (déploiement, e-mail, domaine), quand le vocabulaire des services ne
 * convient pas : `pending` pour ce qui attend ou tourne encore (« En file », « Vérification »).
 */
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "pending"

/** Couleur de chaque ton, prise dans les jetons de statut : mêmes teintes que les services. */
export const STATUS_TONE_COLOR: Readonly<Record<StatusTone, ServiceStatus>> = {
  neutral: "unknown",
  success: "operational",
  warning: "degraded",
  danger: "outage",
  info: "maintenance",
  pending: "degraded",
}

/**
 * Le point d'un statut, décoratif (`aria-hidden`) : il accompagne toujours un libellé.
 * `live` ajoute l'anneau qui s'élargit, pour ce qui est en cours (incident, vérification DNS).
 */
export function StatusDot({
  status: statusProp,
  tone,
  live = false,
  className,
}: {
  /** Statut de service ; sinon `tone`. */
  status?: ServiceStatus
  tone?: StatusTone
  live?: boolean
  className?: string
}): React.JSX.Element {
  const status = statusProp ?? STATUS_TONE_COLOR[tone ?? "neutral"]
  return (
    <span aria-hidden data-slot="status-dot" className={cn("relative inline-flex size-2 shrink-0", className)}>
      {live ? <span className={cn("absolute inset-0 live-ping rounded-full", DOT[status])} /> : null}
      <span className={cn("relative inline-flex size-full rounded-full", DOT[status])} />
    </span>
  )
}

export type StatusBadgeProps =
  | {
      /** Disponibilité d'un service : le libellé de la famille par défaut. */
      status: ServiceStatus
      tone?: never
      label?: string
      live?: boolean
      className?: string
    }
  | {
      status?: never
      /** Statut d'autre chose (déploiement, e-mail, domaine) : le libellé est alors obligatoire. */
      tone: StatusTone
      label: string
      /** Par défaut vrai pour `pending` : l'anneau dit que ça tourne encore. */
      live?: boolean
      className?: string
    }

/**
 * Un statut : point et libellé, jamais la couleur seule. Le libellé par défaut est celui de la
 * famille ; un produit peut le préciser (« Panne partielle ») sans changer de couleur.
 *
 * Hors des services, `tone` et `label` : `<StatusBadge tone="success" label="Remis" />`,
 * `<StatusBadge tone="pending" label="En construction" />`.
 */
export function StatusBadge(props: StatusBadgeProps): React.JSX.Element {
  const { label, className } = props
  const status = props.status !== undefined ? props.status : STATUS_TONE_COLOR[props.tone]
  const live = props.live ?? props.tone === "pending"
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      {...(props.tone ? { "data-tone": props.tone } : {})}
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
