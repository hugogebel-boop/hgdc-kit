import Activity01Icon from "@hugeicons/core-free-icons/Activity01Icon"
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon"
import LinkSquare02Icon from "@hugeicons/core-free-icons/LinkSquare02Icon"
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon"
import type { ReactNode } from "react"

import { soloHref, type ProductView } from "./addresses.ts"
import type { FamilyProduct } from "./family-svg.ts"
import { otherViewHref, otherViewLabel } from "./products.ts"
import { SidebarNavItem } from "./sidebar-nav.tsx"

/**
 * Un accès commun de la barre : une adresse, ou un lien du routeur (`{ render: <Link to="/settings" /> }`,
 * dont le `data-status="active"` marque la page ouverte), ou une adresse avec `active`.
 */
export type ShellLink = string | { href?: string; render?: React.ReactElement; active?: boolean }

/** Les trois accès que la coque pose juste au-dessus du compte, toujours dans cet ordre. */
export type AppShellLinks = {
  /** Documentation du produit. */
  documentation?: ShellLink
  /** Réglages du produit ou de l'organisation. */
  settings?: ShellLink
  /** État du service : la page de statut de la coque (`statusPage`) par défaut, `false` pour le retirer. */
  status?: ShellLink | false
}

const COMMON_LINKS = [
  { key: "documentation", label: "Documentation", icon: BookOpen01Icon },
  { key: "settings", label: "Réglages", icon: Settings01Icon },
  { key: "status", label: "État du service", icon: Activity01Icon },
] as const

export function ShellCommonLinks({
  links,
  statusPageUrl,
  otherView,
}: {
  links: AppShellLinks
  statusPageUrl: string | null
  /** Lien vers l'autre vue du produit (ADR 0014), en dernier ; il ne suffit pas à montrer la liste. */
  otherView?: ReactNode
}): React.JSX.Element | null {
  const resolved = {
    documentation: links.documentation,
    settings: links.settings,
    status: links.status === false ? undefined : (links.status ?? statusPageUrl ?? undefined),
  }
  const items = COMMON_LINKS.flatMap(({ key, label, icon }) => {
    const link = resolved[key]
    if (link === undefined) return []
    const props = typeof link === "string" ? { href: link } : link
    return [
      <SidebarNavItem
        key={key}
        icon={icon}
        label={label}
        {...(props.href !== undefined ? { href: props.href } : {})}
        {...(props.render !== undefined ? { render: props.render } : {})}
        {...(props.active !== undefined ? { active: props.active } : {})}
      />,
    ]
  })
  if (!items.length) return null
  return (
    <nav aria-label="Accès communs">
      <ul data-slot="app-shell-links" className="grid gap-0.5">
        {items}
        {otherView}
      </ul>
    </nav>
  )
}

/**
 * « Ouvrir seul » (vers `<mot>.hgdc.ch`) ou « Ouvrir dans app.hgdc.ch », discret, sous les accès communs.
 * Le chemin courant n'est lu qu'au clic : le lien rendu par le serveur mène à l'accueil.
 */
export function OtherViewLink({
  product,
  view,
}: {
  product: FamilyProduct
  view: ProductView
}): React.JSX.Element | null {
  const href = otherViewHref(product, view)
  if (!href) return null
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const path = soloHref(`/${product}`, `${window.location.pathname}${window.location.search}`)
    event.currentTarget.href = otherViewHref(product, view, path) ?? href
  }
  return (
    <SidebarNavItem icon={LinkSquare02Icon} label={otherViewLabel(view)} render={<a href={href} onClick={onClick} />} />
  )
}
