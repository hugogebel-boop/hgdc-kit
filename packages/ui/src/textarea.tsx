import * as React from "react"

import { useFieldDescribedBy, useFieldId } from "./field.tsx"
import { cn } from "./cn.ts"

/**
 * `field-sizing: content` fait grandir la zone avec le texte, mais ignore
 * `rows` : vide, elle retombait à `min-h-16`, et un exemple de plusieurs lignes
 * en placeholder était coupé (le « Message » d'une annonce, 2026-09-27).
 * `rows` devient donc une hauteur minimale, en lignes (`lh`) plus le padding.
 */
function Textarea({ className, rows, style, ...props }: React.ComponentProps<"textarea">): React.JSX.Element {
  const fieldId = useFieldId()
  const describedBy = useFieldDescribedBy()
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      style={rows ? { minHeight: `calc(${rows}lh + 1.5rem)`, ...style } : style}
      aria-describedby={props["aria-describedby"] ?? describedBy}
      className={cn(
        "flex field-sizing-content min-h-16 touch-field w-full resize-none rounded-2xl bg-background px-3.5 py-3 text-base ring-1 ring-control-off transition-[color,box-shadow,background-color] duration-(--duration-fast) outline-none ring-inset placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/60",
        className,
      )}
      id={props.id ?? fieldId}
      {...props}
    />
  )
}

export { Textarea }
