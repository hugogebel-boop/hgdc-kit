import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn, type Variants } from "./cn.ts"

export type BadgeTone = "neutral" | "success" | "warning" | "info" | "destructive"

const badgeVariants: Variants<{ tone: BadgeTone }> = cva(
  "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-status-active/15 text-status-active-ink",
        warning: "bg-status-paused/15 text-status-paused-ink",
        info: "bg-info/12 text-info-ink",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
)

function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return (
    <span
      data-slot="badge"
      data-tone={tone ?? "neutral"}
      className={cn(badgeVariants({ tone, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
