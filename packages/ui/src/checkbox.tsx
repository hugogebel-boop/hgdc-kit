import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import MinusSignIcon from "@hugeicons/core-free-icons/MinusSignIcon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "./cn.ts"

/**
 * Case à cocher. Monochrome : cochée, elle prend l'encre du texte (`primary`), l'accent violet
 * reste au focus. Le nom accessible vient d'un `<label>` qui l'entoure, ou d'un `Field`.
 *
 * ```tsx
 * <label className="flex items-center gap-2.5 text-sm">
 *   <Checkbox defaultChecked /> Recevoir le résumé hebdomadaire
 * </label>
 * ```
 */
export function Checkbox({ className, indeterminate, ...props }: CheckboxPrimitive.Root.Props): React.JSX.Element {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "touch-target peer grid size-5 shrink-0 place-items-center rounded-[0.4rem] border border-foreground/25 bg-background text-primary-foreground",
        "transition-[background-color,border-color,box-shadow] duration-(--duration-fast) ease-out outline-none",
        "hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-invalid:border-destructive",
        // Le fond sombre de la case vide ne doit jamais recouvrir le fond coché (même spécificité).
        "dark:bg-white/[0.04] dark:data-checked:bg-primary dark:data-indeterminate:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center data-unchecked:hidden">
        <HugeiconsIcon icon={indeterminate ? MinusSignIcon : Tick02Icon} strokeWidth={2.5} className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
