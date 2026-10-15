import { Meter as MeterPrimitive } from "@base-ui/react/meter"
import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import type { ReactNode } from "react"

import { cn } from "./cn.ts"

const TRACK = "relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
const LABEL = "text-sm font-medium"
const VALUE = "text-sm text-muted-foreground tabular-nums"

/**
 * L'avancement d'une tâche qui finit : import, build, envoi d'une campagne. `value={null}` :
 * durée inconnue, une barre qui glisse (immobile si le mouvement est réduit). Base UI pose
 * `role="progressbar"` et ses valeurs `aria`.
 *
 * Pour une quantité dans une plage (quota, stockage), `Meter`.
 */
export function Progress({
  label,
  value,
  max = 100,
  valueText,
  showValue = true,
  className,
}: {
  /** Ce qui avance, visible et nom accessible : « Envoi de la campagne ». */
  label: ReactNode
  value: number | null
  max?: number
  /** Texte de la valeur, lu aussi par les lecteurs d'écran : « 120 sur 400 e-mails ». Pourcentage par défaut. */
  valueText?: string
  showValue?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      locale="fr-CH"
      {...(valueText !== undefined ? { getAriaValueText: () => valueText } : {})}
      className={cn("grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-2", className)}
    >
      <ProgressPrimitive.Label className={LABEL}>{label}</ProgressPrimitive.Label>
      {showValue && value !== null ? (
        <ProgressPrimitive.Value className={VALUE}>{(formatted) => valueText ?? formatted}</ProgressPrimitive.Value>
      ) : (
        <span />
      )}
      <ProgressPrimitive.Track className={cn(TRACK, "col-span-2")}>
        <ProgressPrimitive.Indicator
          className={cn(
            "block h-full rounded-full bg-primary transition-[width] duration-(--duration-base) ease-out",
            "data-indeterminate:absolute data-indeterminate:inset-y-0 data-indeterminate:w-1/3 data-indeterminate:progress-slide",
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

/** Seuils d'une jauge : au-delà de `warning`, orange ; au-delà de `danger`, rouge. En fraction de `max`. */
export type MeterThresholds = { warning?: number; danger?: number }

/**
 * Une quantité dans une plage connue : quota d'envoi du mois, stockage, sièges. La couleur passe
 * à l'orange puis au rouge près de la limite, et le texte dit toujours la valeur : jamais la
 * couleur seule. Base UI pose `role="meter"`.
 */
export function Meter({
  label,
  value,
  max = 100,
  valueText,
  thresholds = { warning: 0.8, danger: 0.95 },
  className,
}: {
  /** « E-mails envoyés ce mois ». */
  label: ReactNode
  value: number
  max?: number
  /** « 8’200 sur 10’000 ». Pourcentage par défaut. */
  valueText?: string
  thresholds?: MeterThresholds
  className?: string
}): React.JSX.Element {
  const ratio = max > 0 ? value / max : 0
  const level =
    thresholds.danger !== undefined && ratio >= thresholds.danger
      ? "danger"
      : thresholds.warning !== undefined && ratio >= thresholds.warning
        ? "warning"
        : "normal"
  return (
    <MeterPrimitive.Root
      data-slot="meter"
      data-level={level}
      value={Math.min(Math.max(value, 0), max)}
      max={max}
      locale="fr-CH"
      {...(valueText !== undefined ? { getAriaValueText: () => valueText } : {})}
      className={cn("grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-2", className)}
    >
      <MeterPrimitive.Label className={LABEL}>{label}</MeterPrimitive.Label>
      <MeterPrimitive.Value className={VALUE}>{(formatted) => valueText ?? formatted}</MeterPrimitive.Value>
      <MeterPrimitive.Track className={cn(TRACK, "col-span-2")}>
        <MeterPrimitive.Indicator
          className={cn(
            "block h-full rounded-full transition-[width] duration-(--duration-base) ease-out",
            level === "danger" ? "bg-destructive" : level === "warning" ? "bg-status-degraded" : "bg-primary",
          )}
        />
      </MeterPrimitive.Track>
    </MeterPrimitive.Root>
  )
}
