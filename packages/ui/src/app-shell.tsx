import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon"
import PanelLeftCloseIcon from "@hugeicons/core-free-icons/PanelLeftCloseIcon"
import PanelLeftOpenIcon from "@hugeicons/core-free-icons/PanelLeftOpenIcon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useRender } from "@base-ui/react/use-render"
import { createContext, Suspense, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"

import { CommandMenuButton } from "./command-menu.tsx"
import { Drawer, DrawerContent, DrawerTitle } from "./drawer.tsx"
import type { FamilyProduct } from "./family-svg.ts"
import { isApplePlatform, Kbd, KbdGroup } from "./kbd.tsx"
import { PagePending } from "./page-pending.tsx"
import { ProductBadge } from "./product-badge.tsx"
import { ProductRail } from "./product-rail.tsx"
import { HGDC_ACCOUNT, HGDC_PRODUCTS } from "./products.ts"
import { ProductRailShownContext } from "./shell-placement.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { cn } from "./cn.ts"

// ── Rail : la barre latérale réduite aux icônes, mémorisée par navigateur ──────────────

const RAIL_KEY = "sidebar"
const RAIL_EVENT = "sidebarchange"

/**
 * À poser dans le `<head>`, avec `themeInitScript` : il remet le rail avant la première
 * peinture, et la variante CSS `rail:` le lit, donc rien ne saute au chargement.
 */
export const sidebarInitScript: string = `try{if(localStorage.getItem(${JSON.stringify(RAIL_KEY)})==="rail")document.documentElement.dataset.sidebar="rail"}catch(e){}`

function subscribeRail(onChange: () => void): () => void {
  window.addEventListener(RAIL_EVENT, onChange)
  return () => window.removeEventListener(RAIL_EVENT, onChange)
}

/** La barre latérale est-elle réduite en rail ? L'état vit sur `<html data-sidebar="rail">`. */
export function useSidebarRail(): boolean {
  return useSyncExternalStore(
    subscribeRail,
    () => document.documentElement.dataset.sidebar === "rail",
    () => false,
  )
}

export function toggleSidebar(): void {
  const root = document.documentElement
  const rail = root.dataset.sidebar !== "rail"
  if (rail) root.dataset.sidebar = "rail"
  else delete root.dataset.sidebar
  try {
    if (rail) localStorage.setItem(RAIL_KEY, "rail")
    else localStorage.removeItem(RAIL_KEY)
  } catch {
    // Stockage bloqué : le choix vaut pour cette page seulement.
  }
  window.dispatchEvent(new Event(RAIL_EVENT))
}

/** `Ctrl+B` (`⌘B`) réduit ou déplie la barre latérale, hors des champs de saisie. */
function useToggleShortcut(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const target = event.target
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable=true]")) return
      event.preventDefault()
      toggleSidebar()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
}

// ── Navigation ──────────────────────────────────────────────────────────────────────

const ShellContext = createContext<{ closeMobileNav: () => void }>({ closeMobileNav: () => {} })

/** Pour fermer le tiroir mobile depuis un élément de la barre (un sélecteur, un bouton). */
export function useAppShell(): { closeMobileNav: () => void } {
  return useContext(ShellContext)
}

/** La navigation du produit : 4 à 7 entrées, à plat. */
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
        "lg:min-h-9 lg:gap-2.5 lg:py-2 lg:text-shell-muted lg:hover:bg-shell-hover lg:hover:text-shell-foreground",
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

// ── Coque ─────────────────────────────────────────────────────────────────────────────

// Les noms de Hugeicons disent l'état du panneau, pas le geste : « Open » dessine la flèche vers la
// gauche (réduire), « Close » vers la droite (déplier).
const COLLAPSE_ICON = PanelLeftOpenIcon
const EXPAND_ICON = PanelLeftCloseIcon

/** Même boîte qu'une entrée de la barre en rail : 40 × 36 px, icône de 18 px centrée. */
const TOGGLE =
  "relative grid h-9 w-10 shrink-0 place-items-center rounded-xl text-shell-muted outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-shell-hover hover:text-shell-foreground focus-visible:ring-2 focus-visible:ring-ring/50"

function ShortcutHint({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      {label}
      <KbdGroup>
        <Kbd>{isApplePlatform() ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>B</Kbd>
      </KbdGroup>
    </span>
  )
}

function productName(product: FamilyProduct): string {
  if (product === HGDC_ACCOUNT.badge) return HGDC_ACCOUNT.name
  return HGDC_PRODUCTS.find((item) => item.badge === product)?.name ?? `HGDC ${product}`
}

/**
 * Haut de la barre latérale. Dépliée : la marque du produit, et le bouton « Réduire » à droite.
 * En rail : la marque seule, qui devient le bouton « Déplier » au survol de la barre ou au focus,
 * à la même place : le bouton ne descend jamais sous le logo. Les deux états sont dans la page et
 * choisis par la variante CSS `rail:`, donc justes dès la première peinture.
 */
function SidebarHead({ product }: { product: FamilyProduct }): React.JSX.Element {
  return (
    <div className="mt-2 flex h-14 shrink-0 items-center gap-1 px-3">
      <div data-slot="sidebar-brand" className="flex min-w-0 flex-1 items-center gap-2.5 pl-2.25 rail:hidden">
        <ProductBadge product={product} className="size-6" />
        <span className="truncate font-heading text-[0.9375rem] font-semibold">{productName(product)}</span>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-slot="sidebar-collapse"
              onClick={toggleSidebar}
              aria-label="Réduire la barre latérale"
              aria-keyshortcuts="Control+B Meta+B"
              className={cn(TOGGLE, "rail:hidden")}
            />
          }
        >
          <HugeiconsIcon icon={COLLAPSE_ICON} strokeWidth={1.8} aria-hidden className="size-[1.125rem]" />
        </TooltipTrigger>
        <TooltipContent side="right">
          <ShortcutHint label="Réduire" />
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-slot="sidebar-expand"
              onClick={toggleSidebar}
              aria-label="Déplier la barre latérale"
              aria-keyshortcuts="Control+B Meta+B"
              className={cn(TOGGLE, "group/toggle hidden rail:grid")}
            />
          }
        >
          <ProductBadge
            product={product}
            className="col-start-1 row-start-1 size-6 transition-opacity duration-(--duration-fast) ease-out group-hover/sidebar:opacity-0 group-focus-visible/toggle:opacity-0 motion-reduce:transition-none"
          />
          <HugeiconsIcon
            icon={EXPAND_ICON}
            strokeWidth={1.8}
            aria-hidden
            className="col-start-1 row-start-1 size-[1.125rem] opacity-0 transition-opacity duration-(--duration-fast) ease-out group-hover/sidebar:opacity-100 group-focus-visible/toggle:opacity-100 motion-reduce:transition-none"
          />
        </TooltipTrigger>
        <TooltipContent side="right">
          <ShortcutHint label="Déplier" />
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * La coque commune des consoles HGDC, celle de Host. Sur ordinateur, de gauche à droite : la barre
 * des produits de la famille (organisation, Account, pastilles ; élargie au survol à la place
 * de la barre latérale, qui se plie le temps du survol), la barre latérale du produit (sa marque, sa navigation, le compte en bas),
 * réductible en rail (`Ctrl+B`, mémorisé), et la page sur une carte. Sur téléphone : une barre en
 * haut, le menu dans un tiroir qui monte du bas et se referme quand on choisit une page ; les
 * produits restent dans le menu de l'avatar.
 *
 * Le kit ne connaît ni le routeur ni l'authentification : le produit passe ses éléments
 * (`OrgSwitcher`, `SidebarNav`, `AccountMenu`) et ses liens.
 */
export function AppShell({
  product,
  organization,
  productRail = true,
  accountHref,
  nav,
  sidebarFooter,
  header,
  onSearch,
  searchLabel,
  children,
  contentKey,
  mainClassName,
}: {
  /** Le produit affiché (`"host"`) : sa marque en haut de la barre, « vous êtes ici » dans la barre des produits. */
  product: FamilyProduct
  /** `OrgSwitcher` : en haut de la barre des produits, en haut du tiroir sur téléphone. */
  organization?: ReactNode
  /**
   * `false` : pas de barre des produits (un écran hors de la famille). L'organisation passe alors
   * sous la marque, dans la barre latérale.
   */
  productRail?: boolean
  /** Adresse d'Account dans la barre des produits (un Account local en développement). */
  accountHref?: string | undefined
  /** `SidebarNav` et ses `SidebarNavItem`. */
  nav: ReactNode
  /** Bas de la barre : liens secondaires (Docs, Paramètres) et `AccountMenu`. */
  sidebarFooter?: ReactNode
  /**
   * Barre du haut, à gauche, après la marque sur téléphone : le contexte de la page (sélecteur de
   * projet, rappel). Jamais la recherche : elle passe par `onSearch`.
   */
  header?: ReactNode
  /**
   * Ouvre la palette (`CommandMenu`). La coque pose la recherche toujours au même endroit : à
   * droite de la barre du haut, 384 px sur ordinateur, la loupe seule sur téléphone.
   */
  onSearch?: () => void
  /** Texte du champ de recherche : « Rechercher » par défaut. */
  searchLabel?: string
  children: ReactNode
  /**
   * Clé de la page affichée (le chemin, `location.pathname`) : la zone de contenu devient une
   * frontière `Suspense` neuve à chaque page, qui montre `PagePending` pendant qu'une page charge
   * ses données dans ses composants (`useSuspenseQuery`), au lieu de garder l'ancienne page figée
   * pendant la transition de la navigation. Sans clé, pas de frontière.
   */
  contentKey?: string | undefined
  /**
   * @deprecated La largeur du contenu est la même dans toute la famille (`max-w-6xl`, ADR 0012) :
   * une page étroite passe par `Page` (`@hgdc/ui/page-header`), pas par la coque.
   */
  mainClassName?: string
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  // Barre des produits élargie : la barre latérale se plie le temps du survol (ADR 0011).
  const [railPeek, setRailPeek] = useState(false)
  useToggleShortcut()

  return (
    <ShellContext.Provider value={{ closeMobileNav: () => setMenuOpen(false) }}>
      <ProductRailShownContext value={productRail}>
        <div
          data-slot="app-shell"
          data-rail-peek={railPeek ? "" : undefined}
          className={cn(
            "min-h-dvh lg:grid lg:h-dvh lg:bg-shell",
            productRail ? "lg:grid-cols-[auto_auto_minmax(0,1fr)]" : "lg:grid-cols-[auto_minmax(0,1fr)]",
          )}
        >
          <a
            href="#contenu"
            className="sr-only z-50 rounded-xl bg-background px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
          >
            Aller au contenu
          </a>
          {productRail ? (
            <ProductRail
              current={product}
              organization={organization}
              accountHref={accountHref}
              onExpandedChange={setRailPeek}
            />
          ) : null}
          <aside
            aria-label="Barre latérale"
            className="group/sidebar hidden overflow-hidden text-shell-foreground transition-[width] duration-(--duration-base) ease-ios motion-reduce:transition-none lg:flex lg:w-64 lg:flex-col lg:rail:w-16"
          >
            <SidebarHead product={product} />
            {!productRail && organization ? <div className="shrink-0 px-3 pb-1">{organization}</div> : null}
            {nav}
            {sidebarFooter ? <div className="grid gap-0.5 px-3 pt-1 pb-3">{sidebarFooter}</div> : null}
          </aside>

          <div className="flex min-h-dvh flex-col lg:min-h-0 lg:p-2 lg:pl-0">
            <div className="flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto lg:rounded-xl lg:bg-background">
              <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex h-14 shrink-0 items-center gap-1 border-b border-foreground/5 bg-background px-2 sm:px-4 lg:top-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Ouvrir le menu"
                  className="touch-target grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
                >
                  <HugeiconsIcon icon={Menu01Icon} aria-hidden className="size-5" />
                </button>
                {/* Sur téléphone, la marque du produit est toujours là : pastille et nom. */}
                <div data-slot="app-shell-brand" className="flex shrink-0 items-center gap-2 pr-1 lg:hidden">
                  <ProductBadge product={product} className="size-6" />
                  <span className="font-heading text-[0.9375rem] font-semibold">{productName(product)}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
                {onSearch ? (
                  <CommandMenuButton
                    onClick={onSearch}
                    compact="mobile"
                    className="shrink-0 lg:w-96 lg:max-w-none"
                    {...(searchLabel !== undefined ? { label: searchLabel } : {})}
                  />
                ) : null}
              </header>
              <main
                id="contenu"
                tabIndex={-1}
                className={cn(
                  "mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-8",
                  mainClassName,
                )}
              >
                {contentKey === undefined ? (
                  children
                ) : (
                  <Suspense key={contentKey} fallback={<PagePending />}>
                    {children}
                  </Suspense>
                )}
              </main>
            </div>
          </div>

          <Drawer side="bottom" open={menuOpen} onOpenChange={setMenuOpen}>
            <DrawerContent className="lg:hidden">
              <DrawerTitle className="sr-only">Menu</DrawerTitle>
              {organization ? <div className="px-3 pt-1">{organization}</div> : null}
              {nav}
              {sidebarFooter ? (
                <div className="grid gap-0.5 border-t border-foreground/5 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                  {sidebarFooter}
                </div>
              ) : null}
            </DrawerContent>
          </Drawer>
        </div>
      </ProductRailShownContext>
    </ShellContext.Provider>
  )
}
