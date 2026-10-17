import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import UnfoldMoreIcon from "@hugeicons/core-free-icons/UnfoldMoreIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { Badge } from "./badge.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx"
import { initials } from "./initials.ts"
import { useShellPlacement } from "./shell-placement.ts"
import { cn } from "./cn.ts"

/** Les trois rôles d'une organisation de la famille. */
export type OrgRole = "owner" | "admin" | "member"

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Propriétaire",
  admin: "Admin",
  member: "Membre",
}

/**
 * Le rôle d'une personne dans l'organisation, le même badge dans tous les produits : neutre,
 * monochrome (l'accent violet ne marque pas un rôle). `title` : ce que le rôle permet.
 */
export function RoleBadge({
  orgRole: role,
  title,
  className,
}: {
  orgRole: OrgRole
  title?: string
  className?: string
}): React.JSX.Element {
  return (
    <Badge tone="neutral" data-role={role} title={title} className={className}>
      {ORG_ROLE_LABEL[role]}
    </Badge>
  )
}

export type Organization = {
  id: string
  name: string
  role?: OrgRole
  /** URL d'un logo carré ; sans logo, les initiales du nom (`initials`). */
  logo?: string
}

/** Un lien dans un menu, à l'allure d'un `DropdownMenuItem`. */
export const MENU_LINK_ITEM: string =
  "relative flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-hidden select-none focus:bg-muted focus:text-foreground data-highlighted:bg-muted max-lg:min-h-11 coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

/** Marque d'une organisation : son logo, ou ses initiales (`initials`) sur un carré arrondi. */
export function OrgMark({
  org,
  className,
}: {
  org: Pick<Organization, "name" | "logo">
  className?: string
}): React.JSX.Element {
  if (org.logo)
    return <img src={org.logo} alt="" className={cn("size-8 shrink-0 rounded-lg object-cover", className)} />
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-xs font-semibold text-background uppercase",
        className,
      )}
    >
      {initials(org.name)}
    </span>
  )
}

/**
 * L'organisation active, et le menu pour en changer ou en créer une. En haut de la barre des
 * produits d'`AppShell` (la marque seule, le nom quand la barre s'élargit), dans le tiroir sur
 * téléphone, ou en haut de la barre latérale quand le produit coupe la barre des produits.
 * Présentationnel : le produit passe la liste, l'active et ce qu'il faut faire au choix (changer
 * l'URL `/o/<slug>/…`), le kit n'appelle rien.
 */
export function OrgSwitcher({
  organizations,
  activeId,
  onSelect,
  createHref,
  onCreate,
  className,
}: {
  organizations: Array<Organization>
  activeId: string
  onSelect: (id: string) => void
  /** Lien « Créer une organisation ». */
  createHref?: string
  /** Ou une action, si la création s'ouvre dans une boîte de dialogue. */
  onCreate?: () => void
  className?: string
}): React.JSX.Element | null {
  const placement = useShellPlacement()
  const active = organizations.find((org) => org.id === activeId)
  if (!active) return null
  // En haut de la barre des produits : la marque seule dans 40 px, le nom quand la barre s'élargit.
  const inRail = placement === "product-rail"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Organisation ${active.name}, changer d'organisation`}
            className={cn(
              "flex h-10 w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 text-left coarse:h-11 outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted",
              inRail
                ? "shrink-0 gap-3 px-1 hover:bg-shell-hover aria-expanded:bg-shell-hover"
                : "lg:hover:bg-shell-hover lg:aria-expanded:bg-shell-hover lg:rail:w-auto lg:rail:justify-center lg:rail:px-1",
              className,
            )}
          />
        }
      >
        <OrgMark org={active} />
        <span
          className={cn(
            "min-w-0 flex-1",
            inRail
              ? "opacity-0 transition-opacity duration-(--duration-fast) ease-out group-data-expanded/rail:opacity-100 motion-reduce:transition-none"
              : "lg:rail:hidden",
          )}
        >
          <span className="block truncate text-sm font-medium">{active.name}</span>
          {active.role ? (
            <span className="block truncate text-xs text-muted-foreground lg:text-shell-muted">
              {ORG_ROLE_LABEL[active.role]}
            </span>
          ) : null}
        </span>
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground lg:text-shell-muted",
            inRail
              ? "opacity-0 transition-opacity duration-(--duration-fast) group-data-expanded/rail:opacity-100"
              : "lg:rail:hidden",
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organisations</DropdownMenuLabel>
          {organizations.map((org) => (
            <DropdownMenuItem key={org.id} onClick={() => onSelect(org.id)}>
              <OrgMark org={org} className="size-6 rounded-md bg-muted text-[10px] text-foreground" />
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              {org.id === activeId ? (
                <HugeiconsIcon icon={Tick02Icon} aria-label="Organisation active" className="size-4" />
              ) : org.role ? (
                <span className="text-xs font-normal text-muted-foreground">{ORG_ROLE_LABEL[org.role]}</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {createHref !== undefined ? (
          <>
            <DropdownMenuSeparator />
            <MenuPrimitive.LinkItem href={createHref} className={MENU_LINK_ITEM}>
              <HugeiconsIcon icon={PlusSignIcon} aria-hidden />
              Créer une organisation
            </MenuPrimitive.LinkItem>
          </>
        ) : onCreate !== undefined ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreate}>
              <HugeiconsIcon icon={PlusSignIcon} aria-hidden />
              Créer une organisation
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
