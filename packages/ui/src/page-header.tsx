import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRender } from "@base-ui/react/use-render"
import type { ReactElement, ReactNode } from "react"

import { cn } from "./cn.ts"

export type Crumb = {
  label: string
  /** Lien simple. Pour le routeur du produit, passer `render={<Link to="…" />}`. */
  href?: string
  render?: ReactElement
}

const crumbLink =
  "rounded-md text-muted-foreground transition-colors duration-(--duration-fast) ease-out outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"

function CrumbLink({ crumb }: { crumb: Crumb }): React.JSX.Element {
  return useRender({
    defaultTagName: "a",
    render: crumb.render,
    props: { href: crumb.href, className: crumbLink, children: crumb.label },
  })
}

/**
 * Fil d'Ariane court : organisation, projet, ressource. Le dernier élément est la page ouverte,
 * en texte simple et `aria-current="page"`.
 */
export function Breadcrumbs({ items, className }: { items: Array<Crumb>; className?: string }): React.JSX.Element {
  return (
    <nav aria-label="Fil d'Ariane" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {items.map((crumb, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-1">
              {last || (crumb.href === undefined && crumb.render === undefined) ? (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last ? "text-foreground" : "text-muted-foreground")}
                >
                  {crumb.label}
                </span>
              ) : (
                <CrumbLink crumb={crumb} />
              )}
              {last ? null : (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * En-tête d'une page : fil d'Ariane, titre, description, actions à droite. Une seule action
 * primaire (`Button` par défaut), les autres dans un menu « … » (`DropdownMenu`). Sous `sm`, les
 * actions passent sous le titre.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Array<Crumb>
  className?: string
}): React.JSX.Element {
  return (
    <header data-slot="page-header" className={cn("mb-8 grid gap-3", className)}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
