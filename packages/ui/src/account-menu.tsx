import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon"
import SecurityLockIcon from "@hugeicons/core-free-icons/SecurityLockIcon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import UserIcon from "@hugeicons/core-free-icons/UserIcon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import type { ReactNode } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "./avatar.tsx"
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
import { MENU_LINK_ITEM } from "./org-switcher.tsx"
import type { FamilyProduct } from "./family-svg.ts"
import { ProductBadge } from "./product-badge.tsx"
import { productMenuEntries } from "./products.ts"
import { useLeaveOnClick, useProductRailShown } from "./shell-placement.ts"
import { ThemeSwitch } from "./theme-switch.tsx"

export type HgdcProduct = {
  /** « Host ». */
  name: string
  href: string
  /** Le produit ouvert : coché, sans lien. */
  current?: boolean
  /** Pastille du produit (`host`, `mail`…), prioritaire sur `icon`. */
  badge?: FamilyProduct
  /** Icône du produit sans pastille ; celle d'un tableau de bord par défaut. */
  icon?: IconSvgElement
  /** Texte discret à droite : « Préversion ». */
  hint?: string
}

export type AccountUser = { name: string; email: string; image?: string | null }

/** L'avatar du compte : la photo, sinon les initiales sur la teinte stable de l'adresse. */
function AccountAvatar({ user, size }: { user: AccountUser; size?: "default" | "lg" }): React.JSX.Element {
  return (
    <Avatar size={size}>
      {user.image ? <AvatarImage src={user.image} alt="" /> : null}
      <AvatarFallback colorKey={user.email || user.name} className="text-xs font-semibold uppercase">
        {initials(user.name, user.email)}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Le menu du compte, en bas de la barre latérale (`account` d'`AppShell`). Dans cet ordre :
 * l'identité (avatar, nom, adresse), Profil, Sécurité, Thème (Système, Clair, Sombre, dans le
 * menu), les entrées propres au produit, les autres produits (sur téléphone), puis « Se
 * déconnecter », à part. `row` : avatar, nom et adresse (l'avatar seul en rail) ; `avatar` :
 * l'avatar seul, pour une barre du haut. Le produit passe les actions ; le thème passe par
 * `ThemeProvider`.
 *
 * Documentation, Réglages et État du service ne sont pas ici : la coque les pose au-dessus du
 * compte (`links` d'`AppShell`). L'aide des raccourcis garde sa touche `?`, sans entrée de menu.
 *
 * « Produits » (masquée au-delà de `lg` dans une coque qui affiche la barre des produits, où ils
 * sont déjà ; gardée sur téléphone) liste par défaut Account et les produits ouverts du catalogue
 * (`productMenuEntries`, `@hgdc/ui/products`), avec `product` coché. `products` remplace cette
 * liste ; `products={[]}` la retire.
 */
export function AccountMenu({
  user,
  onProfile,
  onSecurity,
  onSignOut,
  products: productsProp,
  product: currentProduct,
  accountHref,
  children,
  variant = "row",
}: {
  user: AccountUser
  onProfile?: () => void
  onSecurity?: () => void
  /**
   * @deprecated Plus d'entrée « Raccourcis clavier » dans le menu (0.28) : l'aide s'ouvre par la
   * touche `?`, que le produit garde. Ignoré.
   */
  onShortcuts?: () => void
  onSignOut: () => void
  /** Les produits de la famille, pour passer de l'un à l'autre. Le catalogue du kit par défaut. */
  products?: Array<HgdcProduct>
  /** Mot du produit ouvert (« Mail »), coché dans la liste par défaut. */
  product?: string
  /** Adresse d'Account dans la liste par défaut (un Account local en développement). */
  accountHref?: string
  /**
   * @deprecated « État du service » a quitté le menu (0.28) : la coque le pose au-dessus du compte
   * (`links.status` d'`AppShell`, la page de statut de la coque par défaut). Ignoré.
   */
  statusPage?: string | false
  /** Entrées propres au produit (« Administration »), après le thème. */
  children?: ReactNode
  variant?: "row" | "avatar"
}): React.JSX.Element {
  const products = productsProp ?? productMenuEntries({ current: currentProduct, accountHref })
  const railShown = useProductRailShown()
  const leaveOnClick = useLeaveOnClick()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "row" ? (
            <button
              type="button"
              aria-label={`Compte de ${user.name}`}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-xl p-1.5 text-left outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted lg:hover:bg-shell-hover lg:aria-expanded:bg-shell-hover lg:rail:justify-center"
            />
          ) : (
            <button
              type="button"
              aria-label={`Compte de ${user.name}`}
              className="touch-target grid size-9 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          )
        }
      >
        <AccountAvatar user={user} />
        {variant === "row" ? (
          <span className="min-w-0 flex-1 lg:rail:hidden">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground lg:text-shell-muted">{user.email}</span>
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "row" ? "start" : "end"}
        side={variant === "row" ? "top" : "bottom"}
        className="w-72"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
            <AccountAvatar user={user} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="block truncate">{user.email}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {onProfile ? (
          <DropdownMenuItem onClick={onProfile}>
            <HugeiconsIcon icon={UserIcon} aria-hidden />
            Profil
          </DropdownMenuItem>
        ) : null}
        {onSecurity ? (
          <DropdownMenuItem onClick={onSecurity}>
            <HugeiconsIcon icon={SecurityLockIcon} aria-hidden />
            Sécurité
          </DropdownMenuItem>
        ) : null}
        <ThemeSwitch />
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
        {products.length ? (
          <>
            {/* Sur ordinateur, la barre des produits les montre déjà : la section reste pour le téléphone. */}
            <DropdownMenuSeparator className={railShown ? "lg:hidden" : undefined} />
            <DropdownMenuGroup className={railShown ? "lg:hidden" : undefined}>
              <DropdownMenuLabel>Produits</DropdownMenuLabel>
              {products.map((product) =>
                product.current ? (
                  <DropdownMenuItem key={product.name} disabled className="data-disabled:opacity-100">
                    <ProductMenuIcon product={product} />
                    <span className="flex-1">{product.name}</span>
                    <HugeiconsIcon icon={Tick02Icon} aria-label="Produit ouvert" />
                  </DropdownMenuItem>
                ) : (
                  <MenuPrimitive.LinkItem
                    key={product.name}
                    href={product.href}
                    onClick={leaveOnClick}
                    className={MENU_LINK_ITEM}
                  >
                    <ProductMenuIcon product={product} />
                    <span className="flex-1">{product.name}</span>
                    {product.hint ? (
                      <span className="text-xs font-normal text-muted-foreground">{product.hint}</span>
                    ) : null}
                  </MenuPrimitive.LinkItem>
                ),
              )}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <HugeiconsIcon icon={Logout01Icon} aria-hidden />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProductMenuIcon({ product }: { product: HgdcProduct }): React.JSX.Element {
  if (product.badge) return <ProductBadge product={product.badge} />
  return <HugeiconsIcon icon={product.icon ?? DashboardSquare01Icon} aria-hidden />
}
