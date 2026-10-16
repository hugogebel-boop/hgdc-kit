import ComputerIcon from "@hugeicons/core-free-icons/ComputerIcon"
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import KeyboardIcon from "@hugeicons/core-free-icons/KeyboardIcon"
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon"
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon"
import SecurityLockIcon from "@hugeicons/core-free-icons/SecurityLockIcon"
import Sun03Icon from "@hugeicons/core-free-icons/Sun03Icon"
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx"
import { initials } from "./initials.ts"
import { MENU_LINK_ITEM } from "./org-switcher.tsx"
import type { FamilyProduct } from "./family-svg.ts"
import { ProductBadge } from "./product-badge.tsx"
import { productMenuEntries } from "./products.ts"
import { useProductRailShown } from "./shell-placement.ts"
import { useTheme, type Theme } from "./theme.tsx"

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

const THEMES: ReadonlyArray<Theme> = ["light", "dark", "system"]

/**
 * Le menu du compte, en bas de la barre latérale : profil, sécurité, thème, raccourcis, autres
 * produits HGDC, déconnexion. `row` : avatar, nom et adresse (l'avatar seul en rail) ; `avatar` :
 * l'avatar seul, pour une barre du haut. Le produit passe les actions ; le thème passe par
 * `ThemeProvider`.
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
  onShortcuts,
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
  /** Ouvre l'aide des raccourcis clavier. */
  onShortcuts?: () => void
  onSignOut: () => void
  /** Les produits de la famille, pour passer de l'un à l'autre. Le catalogue du kit par défaut. */
  products?: Array<HgdcProduct>
  /** Mot du produit ouvert (« Mail »), coché dans la liste par défaut. */
  product?: string
  /** Adresse d'Account dans la liste par défaut (un Account local en développement). */
  accountHref?: string
  /** Entrées propres au produit (« Administration »), après le profil. */
  children?: ReactNode
  variant?: "row" | "avatar"
}): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const products = productsProp ?? productMenuEntries({ current: currentProduct, accountHref })
  const railShown = useProductRailShown()
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
        <Avatar>
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="text-xs font-semibold uppercase">{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
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
        className="w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate text-foreground">{user.name}</span>
            <span className="block truncate">{user.email}</span>
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
        {children}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon
              icon={theme === "dark" ? Moon02Icon : theme === "light" ? Sun03Icon : ComputerIcon}
              aria-hidden
            />
            Thème
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value: unknown) => {
                const next = THEMES.find((t) => t === value)
                if (next) setTheme(next)
              }}
            >
              <DropdownMenuRadioItem value="light">Clair</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Sombre</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">Système</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onShortcuts ? (
          <DropdownMenuItem onClick={onShortcuts}>
            <HugeiconsIcon icon={KeyboardIcon} aria-hidden />
            Raccourcis clavier
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
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
                  <MenuPrimitive.LinkItem key={product.name} href={product.href} className={MENU_LINK_ITEM}>
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
