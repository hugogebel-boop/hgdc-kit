import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "./cn.ts"

type ChoiceCardsProps<T extends string> = {
  value: T | null
  onValueChange: (value: T) => void
  options: Array<{
    value: T
    title: string
    /** Une ligne sous le titre : ce que recouvre le choix. */
    description?: string
    /** Logo ou icône, 24 px environ. */
    icon?: React.ReactNode
  }>
  /** Nom du groupe pour les technologies d'assistance. */
  label: string
  className?: string
}

/**
 * Un choix parmi quelques options riches, présentées en tuiles : l'outil à brancher, un
 * modèle de départ. Deux colonnes sur téléphone, trois au-delà ; chaque tuile garde une cible
 * de 44 px au moins. Sémantique de groupe radio : les flèches passent d'une tuile à l'autre,
 * Tab sort du groupe.
 *
 * ```tsx
 * <ChoiceCards label="Outil" value={tool} onValueChange={setTool}
 *   options={[{ value: "grafana", title: "Grafana", description: "Contact point Webhook" }]} />
 * ```
 */
export function ChoiceCards<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: ChoiceCardsProps<T>): React.JSX.Element {
  return (
    <RadioGroupPrimitive
      data-slot="choice-cards"
      aria-label={label}
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3", className)}
    >
      {options.map((option) => (
        <RadioPrimitive.Root
          key={option.value}
          value={option.value}
          aria-label={option.description ? `${option.title}, ${option.description}` : option.title}
          className={cn(
            "flex min-h-11 flex-col items-start gap-2 rounded-2xl border border-border bg-card p-3 text-left sm:p-4",
            "transition-[border-color,box-shadow,background-color] duration-(--duration-fast) ease-out outline-none",
            "hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
            "data-checked:border-primary data-checked:bg-primary/5 data-checked:ring-1 data-checked:ring-primary",
            "data-disabled:cursor-not-allowed data-disabled:opacity-50",
          )}
        >
          {option.icon ? (
            <span aria-hidden className="grid size-8 place-items-center text-foreground">
              {option.icon}
            </span>
          ) : null}
          <span className="text-sm font-medium text-pretty">{option.title}</span>
          {option.description ? (
            <span className="text-xs text-pretty text-muted-foreground">{option.description}</span>
          ) : null}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  )
}
