import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import type { ReactElement, ReactNode } from "react"

import { cn } from "./cn.ts"
import { Skeleton } from "./skeleton.tsx"

/**
 * Liste de ressources (projets, domaines, clés, moniteurs) : une carte `surface`, une ligne par
 * ressource, séparées d'un filet. La forme des listes de Host, plus lisible qu'un tableau quand
 * chaque ressource tient en un titre et une ligne de méta.
 */
export function ResourceList({
  className,
  surface = true,
  ...props
}: React.ComponentProps<"ul"> & { surface?: boolean }): React.JSX.Element {
  return (
    <ul
      data-slot="resource-list"
      className={cn("overflow-hidden", surface && "surface rounded-3xl", className)}
      {...props}
    />
  )
}

/**
 * Une ressource : icône, titre, méta, badge, actions. Avec `href` ou `render`, le titre devient
 * le lien de la ligne, étiré sur toute sa surface ; les actions restent cliquables au-dessus.
 */
export function ResourceItem({
  icon,
  title,
  meta,
  badge,
  actions,
  href,
  render,
  className,
}: {
  /** Icône, favicon ou marque, dans une tuile de 40 px. */
  icon?: ReactNode
  title: ReactNode
  /** Une ligne de contexte : adresse, date, auteur. Deux lignes au plus sur un écran étroit, puis tronquée. */
  meta?: ReactNode
  badge?: ReactNode
  /** Boutons-icônes ou menu « … ». */
  actions?: ReactNode
  href?: string
  /** Lien du routeur du produit : `render={<Link to="…" />}`. */
  render?: ReactElement
  className?: string
}): React.JSX.Element {
  const linked = href !== undefined || render !== undefined
  return (
    <li
      data-slot="resource-item"
      className={cn(
        "relative flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-(--duration-fast) ease-out not-first:border-t not-first:border-foreground/5 sm:gap-4 sm:px-5",
        linked && "hover:bg-foreground/[0.03] has-focus-visible:bg-foreground/[0.03]",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-background text-muted-foreground dark:bg-muted [&_svg:not([class*='size-'])]:size-5"
        >
          {icon}
        </span>
      ) : null}
      {/* Le texte réclame 12 rem. S'il ne les a pas à côté du badge et des actions (téléphone,
          texte agrandi), ceux-ci passent sous le titre au lieu de le réduire à trois lettres
          (« Avenant… » à 360 px, 2026-10-18). Visibles partout : un rôle ou un état ne disparaît
          pas faute de place. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="truncate text-sm font-medium">
            {linked ? (
              <ResourceLink href={href} render={render}>
                {title}
              </ResourceLink>
            ) : (
              title
            )}
          </p>
          {meta ? <p className="mt-0.5 line-clamp-2 text-xs break-words text-muted-foreground">{meta}</p> : null}
        </div>
        {badge || actions ? (
          <div
            data-slot="resource-item-trailing"
            className="flex max-w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4"
          >
            {badge ? <div className="shrink-0">{badge}</div> : null}
            {actions ? <div className="relative z-1 flex shrink-0 items-center gap-1">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}

function ResourceLink({
  href,
  render,
  children,
}: {
  href: string | undefined
  render: ReactElement | undefined
  children: ReactNode
}): React.JSX.Element {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        "data-slot": "resource-link",
        className:
          "outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset",
      } as React.ComponentProps<"a">,
      href !== undefined ? { href, children } : { children },
    ),
  })
}

/** Lignes de chargement à la forme d'un `ResourceItem` avec icône. */
export function ResourceListSkeleton({ rows = 4 }: { rows?: number }): React.JSX.Element {
  return (
    <ul aria-hidden data-slot="resource-list-skeleton" className="surface overflow-hidden rounded-3xl">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="flex min-h-16 items-center gap-4 px-5 py-3 not-first:border-t not-first:border-foreground/5"
        >
          <Skeleton className="size-10 shrink-0" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-1/3 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  )
}
