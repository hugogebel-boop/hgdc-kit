import { cva, type VariantProps } from "class-variance-authority"

import { cn, type Variants } from "./cn.ts"

/**
 * État vide. `variant="card"` : la carte commune d'une page sans contenu (liste, tableau, tableau
 * de bord vides), la même dans tous les produits. `plain` (défaut) : sans fond, dans une carte
 * existante ou un panneau. L'icône (`EmptyMedia variant="icon"`) reste monochrome : l'accent
 * violet est réservé au focus, aux liens et à l'élément actif.
 */
function Empty({
  className,
  variant = "plain",
  ...props
}: React.ComponentProps<"div"> & { variant?: "plain" | "card" }): React.JSX.Element {
  return (
    <div
      data-slot="empty"
      data-variant={variant}
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-2xl p-12 text-center text-balance",
        variant === "card" && "surface rounded-3xl px-6 py-14",
        className,
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div data-slot="empty-header" className={cn("flex max-w-sm flex-col items-center gap-2", className)} {...props} />
  )
}

const emptyMediaVariants: Variants<{ variant: "default" | "icon" }> = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground [&_svg:not([class*='size-'])]:size-7",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>): React.JSX.Element {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="empty-title"
      className={cn("font-heading text-lg font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="empty-content"
      className={cn("flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance", className)}
      {...props}
    />
  )
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia }
