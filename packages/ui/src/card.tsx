import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "./cn.ts"

type CardProps = useRender.ComponentProps<"section"> & {
  /** `danger` : la zone des actions irréversibles (supprimer un projet), cerclée de rouge. */
  tone?: "default" | "danger"
  /**
   * Toute la carte est cliquable (`render={<Link to="…" />}`) : le survol fonce la teinte,
   * l'appui l'enfonce à peine. Jamais d'ombre ni de zoom.
   */
  interactive?: boolean
}

/**
 * Carte de la DA : une teinte (`surface`), ni contour ni ombre, `rounded-3xl`. Un seul niveau
 * de carte par écran ; ce qui est dedans reste à plat.
 */
function Card({ className, tone = "default", interactive = false, render, ...props }: CardProps): React.JSX.Element {
  return useRender({
    defaultTagName: "section",
    render,
    props: mergeProps<"section">(
      {
        "data-slot": "card",
        "data-tone": tone,
        className: cn(
          "flex flex-col overflow-hidden rounded-3xl text-card-foreground",
          interactive
            ? "surface-link pressable-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            : "surface",
          tone === "danger" && "ring-1 ring-destructive/30 ring-inset",
          className,
        ),
      } as React.ComponentProps<"section">,
      props,
    ),
  })
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-5 pt-5 sm:px-6 sm:pt-6 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, children, ...props }: React.ComponentProps<"h2">): React.JSX.Element {
  return (
    <h2 data-slot="card-title" className={cn("text-base font-semibold", className)} {...props}>
      {children}
    </h2>
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element {
  return (
    <p data-slot="card-description" className={cn("max-w-prose text-sm text-muted-foreground", className)} {...props} />
  )
}

/** Action en haut à droite de l'en-tête (un bouton « … », un lien « Tout voir »). */
function CardAction({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="card-content"
      className={cn("grid gap-4 px-5 py-5 sm:px-6 sm:py-6 [[data-slot=card-header]+&]:pt-4", className)}
      {...props}
    />
  )
}

/** Pied d'action, comme celui des réglages de Host : un filet, puis les boutons alignés à droite. */
function CardFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-foreground/5 bg-foreground/[0.02] px-5 py-3 sm:px-6",
        className,
      )}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, type CardProps }
