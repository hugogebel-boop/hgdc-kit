import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useRender } from "@base-ui/react/use-render"
import type { ReactNode } from "react"

import { cn } from "./cn.ts"
import { useAppShell } from "./shell-context.ts"
import { useSidebarRail } from "./sidebar-rail.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"

/**
 * La navigation du produit : 4 à 7 entrées, à plat. Une navigation imbriquée (l'espace d'une page,
 * d'un projet) commence par `SidebarNavBack` et range ses entrées dans des `SidebarNavGroup`.
 */
export function SidebarNav({
  label,
  className,
  children,
}: {
  /** Nom de la navigation pour les lecteurs d'écran : « Projet », « Organisation ». */
  label: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <nav aria-label={label} className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-2", className)}>
      <ul className="grid gap-0.5">{children}</ul>
    </nav>
  )
}

/**
 * Une entrée de la barre. « Vous êtes ici » par `active` (ou `data-status="active"`, que pose le
 * `Link` de TanStack Router) : teinte de la coque, jamais l'accent. En rail, l'icône seule, et le
 * nom en infobulle.
 */
export function SidebarNavItem({
  icon,
  label,
  active,
  href,
  render,
}: {
  icon: IconSvgElement
  label: string
  active?: boolean
  href?: string
  /** Lien du routeur : `render={<Link to="…" />}`. */
  render?: React.ReactElement
}): React.JSX.Element {
  const rail = useSidebarRail()
  const { closeMobileNav } = useAppShell()
  const link = useRender({
    defaultTagName: "a",
    render,
    props: {
      href,
      "aria-current": active ? "page" : undefined,
      onClick: closeMobileNav,
      className: cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out",
        "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        "aria-[current=page]:bg-muted aria-[current=page]:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground",
        "min-h-11 lg:min-h-9 coarse:min-h-11 lg:gap-2.5 lg:py-2 lg:text-shell-muted lg:hover:bg-shell-hover lg:hover:text-shell-foreground",
        "lg:aria-[current=page]:bg-shell-active lg:aria-[current=page]:text-shell-foreground lg:data-[status=active]:bg-shell-active lg:data-[status=active]:text-shell-foreground",
        "lg:rail:justify-center lg:rail:px-0",
      ),
      children: (
        <>
          <HugeiconsIcon icon={icon} strokeWidth={1.8} aria-hidden className="size-5 shrink-0 lg:size-[1.125rem]" />
          <span className="truncate lg:rail:sr-only">{label}</span>
        </>
      ),
    },
  })
  return (
    <li>
      <Tooltip disabled={!rail}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </li>
  )
}

/**
 * Retour au niveau du dessus, en tête d'une navigation imbriquée : « Retour aux pages » quand la
 * barre montre l'espace d'une page, d'un projet. Premier enfant de `SidebarNav`, au-dessus des
 * groupes. Une pastille teintée, flèche à gauche, jamais « vous êtes ici ». En rail, la flèche seule
 * et le texte en infobulle.
 */
export function SidebarNavBack({
  label,
  href,
  render,
}: {
  /** « Retour aux pages » */
  label: string
  href?: string
  /** Lien du routeur : `render={<Link to="…" />}`. */
  render?: React.ReactElement
}): React.JSX.Element {
  const rail = useSidebarRail()
  const { closeMobileNav } = useAppShell()
  const link = useRender({
    defaultTagName: "a",
    render,
    props: {
      href,
      onClick: closeMobileNav,
      "data-slot": "sidebar-nav-back",
      className: cn(
        // Jamais marqué actif : le lien du routeur pose `data-status="active"` sur un parent ouvert.
        "group/back flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-sm font-medium whitespace-nowrap text-foreground outline-none transition-colors duration-(--duration-fast) ease-out",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        "min-h-11 lg:min-h-9 coarse:min-h-11 lg:py-2 lg:bg-shell-hover lg:text-shell-foreground lg:hover:bg-shell-active",
        "lg:rail:justify-center lg:rail:px-0",
      ),
      children: (
        <>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            aria-hidden
            className="size-4.5 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) ease-out group-hover/back:-translate-x-0.5 motion-reduce:transition-none lg:size-4 lg:text-shell-muted"
          />
          <span className="truncate lg:rail:sr-only">{label}</span>
        </>
      ),
    },
  })
  return (
    <li className="pb-2">
      <Tooltip disabled={!rail}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </li>
  )
}
