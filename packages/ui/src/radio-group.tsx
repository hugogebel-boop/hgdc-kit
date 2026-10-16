import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "./cn.ts"

/**
 * Groupe de boutons radio : un seul choix parmi peu d'options, toutes visibles. Les flèches
 * passent d'une option à l'autre, Tab sort du groupe. Le groupe se nomme par
 * `aria-labelledby` (un titre) ou un `Fieldset`.
 *
 * ```tsx
 * <RadioGroup aria-labelledby="role" defaultValue="member">
 *   <label className="flex items-center gap-2.5 text-sm"><RadioGroupItem value="admin" /> Admin</label>
 *   <label className="flex items-center gap-2.5 text-sm"><RadioGroupItem value="member" /> Membre</label>
 * </RadioGroup>
 * ```
 */
export function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props): React.JSX.Element {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />
}

export function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props): React.JSX.Element {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "touch-target grid size-5 shrink-0 place-items-center rounded-full border border-foreground/25 bg-background",
        "transition-[border-color,box-shadow] duration-(--duration-fast) ease-out outline-none",
        "hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:border-primary data-checked:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "aria-invalid:border-destructive data-invalid:border-destructive",
        "dark:bg-white/[0.04] dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="size-2 rounded-full bg-primary-foreground data-unchecked:hidden" />
    </RadioPrimitive.Root>
  )
}
