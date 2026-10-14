// Même dessin dans tout l'écosystème.
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "./cn.ts"

type SegmentedControlProps<T extends string> = {
  value: T
  onValueChange: (value: T) => void
  options: Array<{
    value: T
    label: string
    /** Remplace le libellé, qui devient alors l'étiquette accessible. */
    icon?: IconSvgElement
  }>
  /** Compact variant — smaller padding and text. */
  size?: "md" | "sm"
  /**
   * Nom du groupe pour les technologies d'assistance, quand aucun `<label>`
   * ne peut le désigner : un titre de champ est un `<div>`, rien ne le relie
   * au groupe autrement.
   */
  label?: string
  className?: string
}

/**
 * Horizontal segmented toggle: a row of mutually-exclusive options sharing a
 * single pill container. Accessible via a button group with `aria-pressed`.
 *
 * Une option peut porter une icône au lieu de son libellé. Trois mots côte à
 * côte obligeaient à élargir le conteneur pour que le plus long tienne, et
 * « Clair / Sombre / Système » se lit de toute façon plus vite en soleil, lune
 * et écran. Le libellé devient alors l'étiquette accessible et l'infobulle : la
 * signification reste atteignable, elle n'occupe plus la place.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  label,
  className,
}: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex w-fit max-w-full shrink-0 overflow-hidden rounded-3xl border border-border bg-background p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-label={opt.icon ? opt.label : undefined}
            title={opt.icon ? opt.label : undefined}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              // Pas de flex-1 : une demi-colonne trop étroite rend le segment
              // actif circulaire et casse « Follow-up » au tiret.
              "touch-target shrink-0 rounded-full px-3.5 font-medium whitespace-nowrap",
              "transition-colors duration-150 ease-out",
              opt.icon && "flex items-center justify-center",
              size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon ? (
              <HugeiconsIcon icon={opt.icon} strokeWidth={2} className={size === "sm" ? "size-4" : "size-[1.15rem]"} />
            ) : (
              opt.label
            )}
          </button>
        )
      })}
    </div>
  )
}
