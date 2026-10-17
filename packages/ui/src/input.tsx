import { Input as InputPrimitive } from "@base-ui/react/input"
import Calendar03Icon from "@hugeicons/core-free-icons/Calendar03Icon"
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import * as React from "react"

import { useFieldDescribedBy, useFieldId } from "./field.tsx"
import { cn } from "./cn.ts"

/**
 * Les champs de date et d'heure portent leur icône à gauche.
 *
 * iOS n'en dessine aucune : une échéance ressemblait à un champ texte vide. Et
 * sans `appearance: none` (classe `date-field`, `styles.css`), Safari donne au
 * champ une largeur propre qui débordait de la feuille du bas, son filet
 * courant jusqu'au bord de l'écran.
 */
const PICKER_ICONS: Partial<Record<string, IconSvgElement>> = {
  date: Calendar03Icon,
  month: Calendar03Icon,
  "datetime-local": Calendar03Icon,
  time: Clock01Icon,
}

const INPUT_CLASS =
  // Le champ du site : fond de page, un filet `control-off` au repos (3:1 du
  // fond, WCAG 1.4.11 : à 70 % de `border`, un champ vide disparaissait sur une
  // page blanche), et l'anneau plein au focus, le seul endroit où l'accent dit
  // « c'est ici ». Texte à 16 px à toutes les largeurs : sous 16 px, Safari
  // zoome au focus, et un iPad (768, 1024) en recevait 14.
  "h-11 lg:h-10 touch-field w-full min-w-0 rounded-2xl bg-background px-3.5 py-1 text-base ring-1 ring-control-off transition-[color,box-shadow,background-color] duration-(--duration-fast) outline-none ring-inset file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/60"

function Input({ className, type, ...props }: React.ComponentProps<"input">): React.JSX.Element {
  const fieldId = useFieldId()
  const describedBy = useFieldDescribedBy()
  const pickerIcon = type ? PICKER_ICONS[type] : undefined
  const input = (
    <InputPrimitive
      type={type}
      data-slot="input"
      aria-describedby={props["aria-describedby"] ?? describedBy}
      className={cn(INPUT_CLASS, pickerIcon && "relative date-field pl-10", className)}
      id={props.id ?? fieldId}
      {...props}
    />
  )
  if (!pickerIcon) return input
  return (
    <div className="relative w-full min-w-0">
      {input}
      <HugeiconsIcon
        icon={pickerIcon}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Input }
