import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useState } from "react"

import { cn } from "./cn.ts"
import type { FamilyProduct } from "./family-svg.ts"
import { StatusDot, type ServiceStatus } from "./status.tsx"

/**
 * Bandeau d'état d'un produit (ADR 0018) : lit `summary.json` de sa page de statut (format
 * Statuspage, CORS ouvert) depuis le navigateur, après le premier rendu, puis toutes les
 * 2 minutes quand l'onglet est visible. Il ne retarde jamais le produit, et une lecture qui
 * échoue n'affiche rien : jamais de fausse alerte. Pas de liseré : le point et les mots portent l'état.
 */

/** Page de statut d'un produit de la famille. Docs vit à `/documentation` (`/docs` sert l'aide de Status). */
export function statusPageUrlFor(product: FamilyProduct): string {
  return `https://status.hgdc.ch/${product === "docs" ? "documentation" : product}`
}

export type ServiceEvent = {
  id: string
  kind: "incident" | "maintenance" | "upcoming"
  status: ServiceStatus
  title: string
  /** « Cause identifiée · mis à jour à 14:15 », « mardi 21 octobre, de 22:00 à 23:30 ». */
  detail: string
  href: string
  /** Change à chaque mise à jour : un bandeau fermé revient avec la suivante. */
  version: string
}

/** Une maintenance annoncée s'affiche 24 h avant son début. */
export const UPCOMING_NOTICE_MS: number = 24 * 3_600_000

const STATUS_WORDS: Record<string, string> = {
  investigating: "Analyse en cours",
  identified: "Cause identifiée",
  monitoring: "Sous surveillance",
  in_progress: "En cours",
  verifying: "Vérification",
}

const time = new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" })
const dayMonth = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  weekday: "long",
  day: "numeric",
  month: "long",
})

type SummaryEvent = {
  id?: unknown
  name?: unknown
  status?: unknown
  impact?: unknown
  updated_at?: unknown
  shortlink?: unknown
  scheduled_for?: unknown
  scheduled_until?: unknown
}

const text = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * Lien d'un événement, lu dans `summary.json` : jamais rendu tel quel. Seule une adresse `https:`
 * de la même origine que la page de statut est gardée ; sinon, la page elle-même.
 */
export function safeEventHref(candidate: unknown, pageUrl: string): string {
  try {
    const page = new URL(pageUrl)
    const url = new URL(text(candidate), page)
    if (url.protocol === "https:" && url.origin === page.origin) return url.href
  } catch {
    // Adresse illisible : la page.
  }
  return pageUrl
}
const instant = (v: unknown) => (typeof v === "string" ? Date.parse(v) : Number.NaN)

function incidentTone(impact: string): ServiceStatus {
  return impact === "critical" ? "outage" : "degraded"
}

/**
 * Événements à montrer, d'après un `summary.json` : incidents ouverts, maintenances en cours,
 * maintenances qui commencent dans les 24 h. Pannes d'abord. Les liens restent sur `pageUrl` (`safeEventHref`) :
 * l'adresse annoncée par le fichier lui-même n'est jamais crue. Tout champ manquant ou d'une autre
 * forme écarte l'événement, jamais le bandeau entier.
 */
export function eventsFromSummary(summary: unknown, now: number, pageUrl: string): ServiceEvent[] {
  if (!summary || typeof summary !== "object") return []
  const root = summary as { incidents?: unknown; scheduled_maintenances?: unknown }
  const out: ServiceEvent[] = []
  const list = (v: unknown): SummaryEvent[] => (Array.isArray(v) ? (v as SummaryEvent[]) : [])

  for (const incident of list(root.incidents)) {
    const id = text(incident.id)
    const status = text(incident.status)
    if (!id || !text(incident.name) || status === "resolved" || status === "postmortem") continue
    const updatedAt = instant(incident.updated_at)
    out.push({
      id,
      kind: "incident",
      status: incidentTone(text(incident.impact)),
      title: text(incident.name),
      detail: [STATUS_WORDS[status], Number.isNaN(updatedAt) ? null : `mis à jour à ${time.format(updatedAt)}`]
        .filter(Boolean)
        .join(" · "),
      href: safeEventHref(incident.shortlink, pageUrl),
      version: `${status}:${text(incident.updated_at)}`,
    })
  }

  for (const m of list(root.scheduled_maintenances)) {
    const id = text(m.id)
    const status = text(m.status)
    const from = instant(m.scheduled_for)
    const until = instant(m.scheduled_until)
    if (!id || !text(m.name) || Number.isNaN(from) || Number.isNaN(until)) continue
    const inProgress = status === "in_progress" || status === "verifying"
    const upcoming = status === "scheduled" && from > now && from - now <= UPCOMING_NOTICE_MS
    if (!inProgress && !upcoming) continue
    const sameDay = dayMonth.format(from) === dayMonth.format(until)
    out.push({
      id,
      kind: inProgress ? "maintenance" : "upcoming",
      status: "maintenance",
      title: text(m.name),
      detail: inProgress
        ? `jusqu'à ${time.format(until)}`
        : sameDay
          ? `${dayMonth.format(from)}, de ${time.format(from)} à ${time.format(until)}`
          : `du ${dayMonth.format(from)}, ${time.format(from)}, au ${dayMonth.format(until)}, ${time.format(until)}`,
      href: safeEventHref(m.shortlink, pageUrl),
      version: `${status}:${text(m.updated_at)}`,
    })
  }
  const order = { incident: 0, maintenance: 1, upcoming: 2 }
  return out.sort((a, b) => order[a.kind] - order[b.kind])
}

const REFRESH_MS = 2 * 60_000
const DISMISSED = "hgdc-service-status:"

function dismissedKey(event: ServiceEvent) {
  return `${DISMISSED}${event.id}:${event.version}`
}

function isDismissed(event: ServiceEvent): boolean {
  try {
    return window.sessionStorage.getItem(dismissedKey(event)) === "1"
  } catch {
    return false
  }
}

/**
 * Événements en cours d'une page de statut, lus après le premier rendu puis toutes les
 * 2 minutes, onglet visible. `pageUrl` nul : rien n'est lu. Une lecture ratée vide la liste.
 */
export function useServiceStatus(pageUrl: string | null): {
  events: ServiceEvent[]
  dismiss: (event: ServiceEvent) => void
} {
  const [events, setEvents] = useState<ServiceEvent[]>([])

  useEffect(() => {
    if (!pageUrl) return
    let cancelled = false
    const controller = new AbortController()
    const read = async () => {
      try {
        const response = await fetch(`${pageUrl}/api/v2/summary.json`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!response.ok) throw new Error(String(response.status))
        const next = eventsFromSummary(await response.json(), Date.now(), pageUrl)
        if (!cancelled) setEvents(next)
      } catch {
        if (!cancelled) setEvents([])
      }
    }
    void read()
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void read()
    }, REFRESH_MS)
    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(id)
    }
  }, [pageUrl])

  const dismiss = useCallback((event: ServiceEvent) => {
    try {
      window.sessionStorage.setItem(dismissedKey(event), "1")
    } catch {
      // Stockage indisponible (navigation privée) : fermé pour cette page seulement.
    }
    setEvents((list) => list.filter((e) => e.id !== event.id))
  }, [])

  return { events: events.filter((e) => !isDismissed(e)), dismiss }
}

const LEAD: Record<ServiceEvent["kind"], string> = {
  incident: "Incident en cours",
  maintenance: "Maintenance en cours",
  upcoming: "Maintenance prévue",
}

const TINT: Record<ServiceStatus, string> = {
  outage: "bg-status-outage/8",
  degraded: "bg-status-degraded/12",
  maintenance: "bg-status-maintenance/10",
  operational: "bg-status-operational/10",
  unknown: "bg-foreground/5",
}

/** Une ligne : point de couleur, nature et titre de l'événement, lien vers la page, fermeture. */
export function ServiceStatusBanner({
  event,
  onDismiss,
  className,
}: {
  event: ServiceEvent
  onDismiss?: () => void
  className?: string
}): React.JSX.Element {
  return (
    <div
      role="status"
      data-slot="service-status"
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-2.5 text-sm sm:items-center",
        TINT[event.status],
        className,
      )}
    >
      <StatusDot status={event.status} live={event.kind !== "upcoming"} className="mt-1.5 size-2 shrink-0 sm:mt-0" />
      <p className="min-w-0 flex-1 text-pretty">
        <span className="font-medium">{LEAD[event.kind]}</span>
        <span className="text-muted-foreground"> · </span>
        {event.title}
        {event.detail ? (
          <span className="block text-xs text-muted-foreground sm:ml-2 sm:inline">{event.detail}</span>
        ) : null}
      </p>
      <a
        href={event.href}
        target="_blank"
        rel="noopener"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="max-sm:sr-only">État du service</span>
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden />
      </a>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Masquer jusqu'à la prochaine mise à jour"
          className="-my-1 -mr-1.5 grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

/** Bandeaux d'un produit, posés par `AppShell` en tête du contenu. Rien tant que tout va bien. */
export function ServiceStatus({
  pageUrl,
  className,
}: {
  pageUrl: string | null
  className?: string
}): React.JSX.Element | null {
  const { events, dismiss } = useServiceStatus(pageUrl)
  if (!events.length) return null
  return (
    <div data-slot="service-status-list" className={cn("grid gap-2", className)}>
      {events.map((event) => (
        <ServiceStatusBanner key={event.id} event={event} onDismiss={() => dismiss(event)} />
      ))}
    </div>
  )
}
