import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import UnfoldMoreIcon from "@hugeicons/core-free-icons/UnfoldMoreIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { useState, type ReactElement, type ReactNode } from "react"

import { cn } from "./cn.ts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx"
import { MENU_LINK_ITEM } from "./org-switcher.tsx"

export type SwitcherProject = {
  id: string
  name: string
  /** Image carrée du projet (favicon du site, logo). Sans image, ou si elle ne charge pas : `mark`. */
  iconUrl?: string | null
  /** Une ou deux lettres de repli : la marque du framework, l'initiale du produit. Par défaut, la première lettre du nom. */
  mark?: string
  /** Lien vers le projet ; sans lien, le choix passe par `onSelect`. */
  href?: string
}

/**
 * Identité visuelle d'un projet : son image, ou sa marque en lettres sur un carré gris. La même
 * dans le sélecteur, une liste de projets ou un en-tête.
 */
export function ProjectMark({
  project,
  className,
}: {
  project: Pick<SwitcherProject, "name" | "iconUrl" | "mark">
  className?: string
}): React.JSX.Element {
  const [broken, setBroken] = useState<string | null>(null)
  const url = project.iconUrl && project.iconUrl !== broken ? project.iconUrl : null
  const base = "grid size-6 shrink-0 place-items-center overflow-hidden rounded-md bg-muted"
  if (url)
    return (
      <span aria-hidden data-slot="project-mark" className={cn(base, className)}>
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(url)}
          className="size-[60%] object-contain"
        />
      </span>
    )
  const mark = (project.mark ?? project.name.trim().charAt(0)) || "?"
  return (
    <span
      aria-hidden
      data-slot="project-mark"
      className={cn(base, "font-mono text-[10px] font-semibold text-foreground uppercase", className)}
    >
      {mark}
    </span>
  )
}

/** Rend une destination du menu : un lien (`href`, par `renderLink`) ou une action. */
function SwitcherEntry({
  href,
  onSelect,
  renderLink,
  children,
}: {
  href: string | undefined
  onSelect: (() => void) | undefined
  renderLink: ((href: string) => ReactElement) | undefined
  children: ReactNode
}): React.JSX.Element {
  if (href !== undefined)
    return (
      <MenuPrimitive.LinkItem
        href={href}
        render={renderLink?.(href)}
        closeOnClick
        data-slot="dropdown-menu-item"
        className={MENU_LINK_ITEM}
      >
        {children}
      </MenuPrimitive.LinkItem>
    )
  return <DropdownMenuItem onClick={onSelect}>{children}</DropdownMenuItem>
}

/**
 * Le projet ouvert, ou « Tous les projets » sur les pages de l'organisation, et le menu pour passer
 * d'un projet à l'autre ou en créer un. Dans la barre du haut d'`AppShell` (`header`), à côté de la
 * barre latérale. Le même dans tous les produits qui ont des projets (Host, Docs…).
 *
 * Présentationnel : le produit passe la liste et dit où mène chaque choix, par lien (`href` sur le
 * projet, `allHref`, `createHref`, rendus par `renderLink`, par exemple
 * `(href) => <Link to={href} />`) ou par action (`onSelect`, `onCreate`). `projects` à `undefined`
 * pendant le chargement : le déclencheur montre déjà `activeName` (le segment de l'URL), le menu
 * reste utilisable pour « Tous les projets » et « Nouveau projet ».
 */
export function ProjectSwitcher({
  projects,
  activeId,
  activeName,
  onSelect,
  allHref,
  createHref,
  onCreate,
  renderLink,
  noun = { one: "projet", many: "projets" },
  createLabel = `Nouveau ${noun.one}`,
  className,
}: {
  projects: ReadonlyArray<SwitcherProject> | undefined
  /** Le projet ouvert ; `null` ou absent : « Tous les projets ». */
  activeId?: string | null
  /** Nom affiché tant que la liste charge, ou si le projet actif n'y figure pas. */
  activeName?: string
  /** Choix d'un projet sans `href` (`id`), ou de « Tous les projets » sans `allHref` (`null`). */
  onSelect?: (id: string | null) => void
  allHref?: string
  /** Lien « Nouveau projet ». */
  createHref?: string
  /** Ou une action, si la création s'ouvre dans une boîte de dialogue. */
  onCreate?: () => void
  /** Rend un lien du routeur du produit ; par défaut un `<a href>`. */
  renderLink?: (href: string) => ReactElement
  /** Ce que l'on choisit, nom masculin : `{ one: "site", many: "sites" }` pour Analytics. */
  noun?: { one: string; many: string }
  createLabel?: string
  className?: string
}): React.JSX.Element {
  const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
  const all = `Tous les ${noun.many}`
  const hasActive = activeId !== undefined && activeId !== null
  const current = hasActive ? projects?.find((p) => p.id === activeId) : undefined
  const label = hasActive ? (current?.name ?? activeName ?? "") : all
  const canCreate = createHref !== undefined || onCreate !== undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={
              hasActive ? `${capitalized(noun.one)} ${label}, changer de ${noun.one}` : `${all}, changer de ${noun.one}`
            }
            className={cn(
              "flex h-10 max-w-full min-w-0 items-center gap-2 rounded-xl px-2.5 text-sm font-medium outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted coarse:h-11",
              className,
            )}
          />
        }
      >
        {hasActive ? (
          current ? (
            <ProjectMark project={current} />
          ) : (
            <span aria-hidden className="size-6 shrink-0 rounded-md bg-muted skeleton-pulse" />
          )
        ) : (
          <HugeiconsIcon icon={DashboardSquare01Icon} aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <HugeiconsIcon icon={UnfoldMoreIcon} aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
        <SwitcherEntry href={allHref} onSelect={() => onSelect?.(null)} renderLink={renderLink}>
          <HugeiconsIcon icon={DashboardSquare01Icon} aria-hidden className="size-4" />
          <span className="flex-1">{all}</span>
          {hasActive ? null : <HugeiconsIcon icon={Tick02Icon} aria-label="Vue active" className="size-4" />}
        </SwitcherEntry>
        {projects?.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{capitalized(noun.many)}</DropdownMenuLabel>
              {projects.map((project) => (
                <SwitcherEntry
                  key={project.id}
                  href={project.href}
                  onSelect={() => onSelect?.(project.id)}
                  renderLink={renderLink}
                >
                  <ProjectMark project={project} />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {project.id === activeId ? (
                    <HugeiconsIcon icon={Tick02Icon} aria-label={`${capitalized(noun.one)} actif`} className="size-4" />
                  ) : null}
                </SwitcherEntry>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        {canCreate ? (
          <>
            <DropdownMenuSeparator />
            <SwitcherEntry href={createHref} onSelect={onCreate} renderLink={renderLink}>
              <HugeiconsIcon icon={PlusSignIcon} aria-hidden className="size-4" />
              {createLabel}
            </SwitcherEntry>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
