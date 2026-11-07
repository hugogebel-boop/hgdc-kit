import Settings02Icon from "@hugeicons/core-free-icons/Settings02Icon"
import type { ModuleWord } from "./modules.ts"
import { SIDEBAR_ITEM } from "./sidebar-nav.tsx"
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Suspense, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react"

import type { ProductView } from "./addresses.ts"
import { CommandMenuButton } from "./command-menu.tsx"
import { Drawer, DrawerContent, DrawerTitle } from "./drawer.tsx"
import { FamilyLoaderHost, FamilyLoaderRootContext } from "./family-loader.tsx"
import type { FamilyProduct } from "./family-svg.ts"
import { CONTENT_LOADING_LAYER, ContentLoadingContext, PagePending } from "./page-pending.tsx"
import { ProductBadge } from "./product-badge.tsx"
import { productBarShown, useProductBarPreference, useProductBarSync } from "./product-bar.ts"
import { ShellNavigation, type ShellNavLevel } from "./module-bar.tsx"
import { useProductSwitch } from "./product-switch.ts"
import { cn } from "./cn.ts"
import { ServiceStatus, statusPageUrlFor } from "./service-status.tsx"
import {
  AssistantButton,
  AssistantPanel,
  ASSISTANT_SIDE_BY_SIDE,
  useAssistantShortcut,
  type AppShellAssistant,
} from "./shell-assistant.tsx"
import { ShellContext } from "./shell-context.ts"
import { familyProductName } from "./shell-frame.tsx"
import { OtherViewLink, otherViewMenuLink, ShellCommonLinks, type AppShellLinks } from "./shell-links.tsx"
import { rememberLastProduct, rememberShellNavHeight } from "./shell-memory.ts"
import {
  ModuleBarShownContext,
  ShellLeaveContext,
  ShellMenuLinksContext,
  StatusPageContext,
} from "./shell-placement.ts"
import { ShellOrganizationHead, SidebarHead } from "./sidebar-head.tsx"
import { useToggleShortcut } from "./sidebar-rail.ts"
import { useContentLoading, useHydrated, useIsomorphicLayoutEffect } from "./use-content-loading.ts"
import { useProductLeave } from "./use-product-leave.ts"
import { useMediaQuery } from "./use-media-query.ts"

export { sidebarInitScript, toggleSidebar, useSidebarRail } from "./sidebar-rail.ts"
export { PRODUCT_LEAVE_DELAY_MS } from "./use-product-leave.ts"
export { useAppShell } from "./shell-context.ts"
export { SidebarNav, SidebarNavBack, SidebarNavItem } from "./sidebar-nav.tsx"
export { SidebarNavGroup } from "./sidebar-nav-group.tsx"
export type { AppShellLinks, ShellLink } from "./shell-links.tsx"
export type { AppShellAssistant } from "./shell-assistant.tsx"

/**
 * La coque commune des consoles de Basalte. Sur ordinateur : la barre latérale (l'organisation,
 * Manager, puis les onglets du module ouvert ou la liste des modules, le compte en bas), réductible
 * en rail (`Ctrl+B`, mémorisé), et la page sur une carte. Sur téléphone : une barre en haut, la même
 * navigation dans un tiroir qui monte du bas et se referme quand on choisit une page. Une vue seule
 * (`<mot>.hgdc.ch`) garde la marque du produit à la place de la barre de Basalte.
 *
 * Le kit ne connaît ni le routeur ni l'authentification : le produit passe ses éléments
 * (`OrgSwitcher`, `SidebarNav`, `AccountMenu`) et ses liens.
 */
export function AppShell({
  product,
  organization,
  productRail: productRailOption,
  view: viewOption,
  accountHref,
  nav,
  links,
  account,
  sidebarFooter,
  header,
  onSearch,
  searchLabel,
  assistant,
  children,
  contentKey,
  navigating = false,
  mainClassName,
  statusPage,
  project,
}: {
  /** Le produit affiché (`"host"`) : son nom au-dessus de ses onglets, « vous êtes ici » dans la liste des modules. */
  product: FamilyProduct
  /**
   * `OrgSwitcher` : en haut de la barre latérale et du tiroir sur téléphone. Absent
   * pendant que les données du produit arrivent : la barre lui garde sa place, avec la marque de
   * la dernière organisation affichée (`OrgPlaceholder`, ADR 0020). `null` : aucune organisation.
   */
  organization?: ReactNode
  /**
   * `false` : pas de barre de Basalte (un écran hors de la console, une démo) : la marque du produit
   * en haut, l'organisation dessous. Absent : présente, ou, si `view` est donné, selon la vue
   * et le réglage « Barre des produits » d'Account (ADR 0014), relu par la coque.
   */
  productRail?: boolean
  /**
   * Vue de la page : `app` sous `app.hgdc.ch/<mot>`, `seul` sur `<mot>.hgdc.ch` (ADR 0014). Donnée
   * par le serveur (`requestView` de `@hgdc/auth/server`), la même au rendu et dans le navigateur.
   * Absent : un produit qui n'a qu'une vue, barre présente et pas de lien vers l'autre vue.
   */
  view?: ProductView | undefined
  /** Adresse de Manager dans la barre (un Manager local en développement). */
  accountHref?: string | undefined
  /** `SidebarNav` et ses `SidebarNavItem`. */
  nav: ReactNode
  /**
   * Réglages, juste au-dessus du compte ; Documentation et État du service (qui suit `statusPage` par
   * défaut) dans le menu du compte. Dans une vue seule, les trois au-dessus du compte.
   */
  links?: AppShellLinks
  /** `AccountMenu`, tout en bas de la barre latérale (et du tiroir sur téléphone). */
  account?: ReactNode
  /**
   * Avec `account` : entrées propres au produit, posées au-dessus des accès communs.
   *
   * @deprecated Comme bas de barre complet (liens et `AccountMenu`), remplacé par `links` et
   * `account` (0.29). Sans `account`, il est rendu tel quel sous les accès communs, pour ne rien
   * casser : déplacer `AccountMenu` dans `account`, Docs et Réglages dans `links`, et retirer
   * l'ancien lien vers l'assistant (`assistant`).
   */
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
  /** L'assistant IA : son bouton à côté de la recherche, son panneau à droite de la page. */
  assistant?: AppShellAssistant
  children: ReactNode
  /**
   * Clé de la page affichée (le chemin, `location.pathname`) : la zone de contenu devient une
   * frontière `Suspense` neuve à chaque page, qui montre `PagePending` pendant qu'une page charge
   * ses données dans ses composants (`useSuspenseQuery`), au lieu de garder l'ancienne page figée
   * pendant la transition de la navigation. Sans clé, pas de frontière.
   */
  contentKey?: string | undefined
  /**
   * Une navigation vers une autre page est en cours (TanStack Router :
   * `useRouterState({ select: (s) => s.isLoading && s.location.pathname !== s.resolvedLocation?.pathname })`).
   * Au-delà de 50 ms, la zone de contenu se couvre du H centré, la coque restant en place : jamais
   * l'ancienne page figée, quel que soit ce qui attend (session, loaders, code de la page).
   */
  navigating?: boolean
  /**
   * @deprecated La largeur du contenu est la même dans toute la famille (`max-w-6xl`, ADR 0012) :
   * une page étroite passe par `Page` (`@hgdc/ui/page-header`), pas par la coque.
   */
  mainClassName?: string
  /**
   * Page de statut du produit, dont le bandeau d'état se pose en tête du contenu (ADR 0018) :
   * `https://status.hgdc.ch/<produit>` par défaut, une autre adresse (prévisualisation sur une page
   * de test), ou `false` pour ne rien lire. L'accès « État du service » y mène.
   */
  statusPage?: string | false | undefined
  /**
   * Le projet choisi en haut de page (`useShellProject`) : la liste des modules se limite aux siens, et
   * « Réglages du projet » paraît en bas de la barre. Absent : tous les projets.
   */
  project?: { name: string; modules: ReadonlyArray<ModuleWord>; settingsHref: string } | undefined
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const preference = useProductBarPreference()
  // Relu chez Account seulement par un produit passé aux deux vues (il donne `view`, ADR 0014).
  useProductBarSync(productRailOption === undefined && viewOption !== undefined)
  const productRail = productRailOption ?? (viewOption === undefined || productBarShown(viewOption, preference))
  const [navLevel, setNavLevel] = useState<ShellNavLevel>("tabs")
  useToggleShortcut()
  // Relecture des organisations après un passage depuis la barre, préchargement des autres produits (ADR 0016).
  useProductSwitch(productRail)

  // Chargement de la zone de contenu (ADR 0015) : une navigation en cours (après 50 ms), une page
  // qui attend (`PagePending`, aussitôt : le routeur a déjà attendu), ou le départ vers un autre
  // produit (aussitôt). Une fois montré, au moins 300 ms. Le H est celui du document, en position
  // fixe : il ne bouge pas d'un état à l'autre et n'est jamais démonté.
  const [pagePending, setPagePending] = useState(0)
  const registerPagePending = useCallback(() => {
    setPagePending((count) => count + 1)
    return () => setPagePending((count) => count - 1)
  }, [])
  const { leaving, leave } = useProductLeave()
  const statusPageUrl = statusPage === false ? null : (statusPage ?? statusPageUrlFor(product))
  const loading = useContentLoading({ navigating, pending: pagePending > 0 || leaving })
  // Avant l'hydratation, le CSS montre le calque et le H dès qu'une page attend (`:has`) ; ensuite
  // `data-loading` prend le relais dans la même image.
  const hydrated = useHydrated()
  const hasRoot = useContext(FamilyLoaderRootContext)
  const contentRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  // Mémoire de la coque (ADR 0020) : le produit affiché, pour le cadre d'un chargement qui suivrait
  // hors de la coque dans ce document, et la hauteur de sa navigation, pour le squelette de la
  // barre latérale à la prochaine arrivée sur ce produit.
  useIsomorphicLayoutEffect(() => {
    document.documentElement.dataset.hgdcProduct = product
    rememberLastProduct(product)
  }, [product])
  const navHeight = useRef(0)
  useEffect(() => {
    const list = sidebarRef.current?.querySelector(
      ":scope > nav > ul, [data-slot=shell-navigation] > nav:not([data-slot]) > ul",
    )
    if (!(list instanceof HTMLElement) || list.offsetHeight === navHeight.current) return
    navHeight.current = list.offsetHeight
    rememberShellNavHeight(product, list.offsetHeight)
  })
  useEffect(() => {
    // Sur ordinateur, la zone de contenu défile seule : le calque couvre sa partie visible, en haut.
    if (loading && contentRef.current) contentRef.current.scrollTop = 0
  }, [loading])

  // Assistant : monté à la première ouverture, puis gardé (sa conversation survit à la fermeture).
  const assistantOpen = assistant?.open ?? false
  const [assistantMounted, setAssistantMounted] = useState(assistantOpen)
  const [assistantOpenAtMount] = useState(assistantOpen)
  if (assistantOpen && !assistantMounted) setAssistantMounted(true)
  const wide = useMediaQuery(ASSISTANT_SIDE_BY_SIDE)
  // Vue dédiée (sous 1280 px) : la page, dessous, ne reçoit ni focus ni clic.
  const pageBlocked = assistantOpen && !wide
  const assistantPanelId = useId()
  const assistantButtonRef = useRef<HTMLButtonElement>(null)
  useAssistantShortcut(assistant)

  const otherView = viewOption === undefined ? null : <OtherViewLink product={product} view={viewOption} />
  // Dans la barre de Basalte, seul Réglages reste au-dessus du compte : le reste passe dans son menu.
  const footer = (
    <>
      {account !== undefined ? sidebarFooter : null}
      {productRail && project ? (
        <div className="px-3 pb-1">
          <a href={project.settingsHref} className={SIDEBAR_ITEM}>
            <HugeiconsIcon
              icon={Settings02Icon}
              strokeWidth={1.8}
              aria-hidden
              className="size-5 shrink-0 lg:size-[1.125rem]"
            />
            <span className="truncate lg:rail:sr-only">Réglages du projet</span>
          </a>
        </div>
      ) : null}
      <ShellCommonLinks
        links={
          productRail ? { ...(links?.settings ? { settings: links.settings } : {}), status: false } : (links ?? {})
        }
        statusPageUrl={statusPageUrl}
        otherView={productRail ? null : otherView}
      />
      {account ?? sidebarFooter}
    </>
  )
  const menuLinks = productRail
    ? {
        documentation: links?.documentation,
        status: links?.status === false ? undefined : (links?.status ?? statusPageUrl ?? undefined),
        otherView: viewOption === undefined ? undefined : otherViewMenuLink(product, viewOption),
      }
    : {}
  const navigation = productRail ? (
    <ShellNavigation
      product={product}
      nav={nav}
      accountHref={accountHref}
      level={navLevel}
      onLevelChange={setNavLevel}
      projectModules={project?.modules}
    />
  ) : (
    nav
  )

  return (
    <ShellContext.Provider value={{ closeMobileNav: () => setMenuOpen(false), product }}>
      <ModuleBarShownContext value={productRail}>
        <ShellMenuLinksContext value={menuLinks}>
          <ShellLeaveContext value={leave}>
            <StatusPageContext value={statusPageUrl}>
              <div
                data-slot="app-shell"
                data-module-bar={productRail ? "" : undefined}
                data-loading={loading ? "" : undefined}
                data-hydrated={hydrated ? "" : undefined}
                data-assistant={assistantOpen ? "" : undefined}
                className="min-h-dvh lg:grid lg:h-dvh lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:bg-shell"
              >
                <a
                  href="#contenu"
                  className="sr-only z-50 rounded-xl bg-background px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
                >
                  Aller au contenu
                </a>
                <aside
                  ref={sidebarRef}
                  data-slot="app-shell-sidebar"
                  aria-label="Barre latérale"
                  inert={pageBlocked || undefined}
                  className="group/sidebar hidden overflow-hidden text-shell-foreground transition-[width] duration-(--duration-base) ease-ios motion-reduce:transition-none lg:flex lg:w-64 lg:flex-col lg:rail:w-16"
                >
                  {productRail ? (
                    <ShellOrganizationHead organization={organization} />
                  ) : (
                    <>
                      <SidebarHead product={product} />
                      {organization ? <div className="shrink-0 px-3 pb-1">{organization}</div> : null}
                    </>
                  )}
                  {navigation}
                  <div data-slot="app-shell-footer" className="grid gap-0.5 px-3 pt-1 pb-3 empty:hidden">
                    {footer}
                  </div>
                </aside>

                <div inert={pageBlocked || undefined} className="flex min-h-dvh flex-col lg:min-h-0 lg:p-2 lg:pl-0">
                  <div
                    ref={contentRef}
                    className="relative flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto lg:rounded-xl lg:bg-background lg:[scrollbar-gutter:stable]"
                  >
                    {/* Texte agrandi (200 %) : la barre ne garde pas 56 px coûte que coûte, elle passe
                    à la ligne. Le contexte de la page (`header`) réclame 7 rem ; s'il ne les a pas à
                    côté de la marque, il descend sur une deuxième ligne avec la recherche, au lieu
                    d'être écrasé sous la loupe. À taille normale, tout tient sur une ligne. */}
                    <header
                      data-slot="app-shell-header"
                      className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex min-h-14 shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-foreground/5 bg-background px-2 py-1.5 sm:px-4 lg:top-0"
                    >
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
                        <span className="font-heading text-[0.9375rem] font-semibold">
                          {familyProductName(product)}
                        </span>
                      </div>
                      <div className={cn("flex min-w-0 items-center gap-2", header ? "flex-[1_1_7rem]" : "flex-1")}>
                        {header}
                      </div>
                      {onSearch ? (
                        <CommandMenuButton
                          onClick={onSearch}
                          compact="mobile"
                          className="shrink-0 lg:w-96 lg:max-w-none"
                          {...(searchLabel !== undefined ? { label: searchLabel } : {})}
                        />
                      ) : null}
                      {assistant ? (
                        <AssistantButton
                          assistant={assistant}
                          panelId={assistantPanelId}
                          buttonRef={assistantButtonRef}
                        />
                      ) : null}
                    </header>
                    <div data-slot="app-shell-loading" aria-hidden={!loading} className={CONTENT_LOADING_LAYER}>
                      {loading ? (
                        <span role="status" className="sr-only">
                          Chargement…
                        </span>
                      ) : null}
                    </div>
                    <main
                      id="contenu"
                      tabIndex={-1}
                      aria-busy={loading ? true : undefined}
                      inert={loading || undefined}
                      className={cn(
                        "mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-8",
                        mainClassName,
                      )}
                    >
                      <ServiceStatus pageUrl={statusPageUrl} className="mb-6" />
                      <ContentLoadingContext value={registerPagePending}>
                        {contentKey === undefined ? (
                          children
                        ) : (
                          <Suspense key={contentKey} fallback={<PagePending />}>
                            {children}
                          </Suspense>
                        )}
                      </ContentLoadingContext>
                    </main>
                  </div>
                </div>

                {assistant && assistantMounted ? (
                  <AssistantPanel
                    assistant={assistant}
                    panelId={assistantPanelId}
                    wide={wide}
                    openAtShellMount={assistantOpenAtMount}
                    buttonRef={assistantButtonRef}
                  />
                ) : null}

                {hasRoot ? null : <FamilyLoaderHost />}

                <Drawer side="bottom" open={menuOpen} onOpenChange={setMenuOpen}>
                  <DrawerContent className="lg:hidden">
                    <DrawerTitle className="sr-only">Menu</DrawerTitle>
                    {organization ? <div className="px-3 pt-1">{organization}</div> : null}
                    {navigation}
                    <div className="grid gap-0.5 border-t border-foreground/5 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] empty:hidden">
                      {footer}
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </StatusPageContext>
          </ShellLeaveContext>
        </ShellMenuLinksContext>
      </ModuleBarShownContext>
    </ShellContext.Provider>
  )
}
