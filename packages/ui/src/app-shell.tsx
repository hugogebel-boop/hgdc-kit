import Activity01Icon from "@hugeicons/core-free-icons/Activity01Icon"
import AiMagicIcon from "@hugeicons/core-free-icons/AiMagicIcon"
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon"
import PanelLeftCloseIcon from "@hugeicons/core-free-icons/PanelLeftCloseIcon"
import PanelLeftOpenIcon from "@hugeicons/core-free-icons/PanelLeftOpenIcon"
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useRender } from "@base-ui/react/use-render"
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { CommandMenuButton } from "./command-menu.tsx"
import { Drawer, DrawerContent, DrawerTitle } from "./drawer.tsx"
import { FamilyLoaderHost, FamilyLoaderRootContext } from "./family-loader.tsx"
import type { FamilyProduct } from "./family-svg.ts"
import { isApplePlatform, Kbd, KbdGroup } from "./kbd.tsx"
import {
  CONTENT_LOADING_LAYER,
  ContentLoadingContext,
  PAGE_PENDING_MIN_MS,
  PAGE_PENDING_MS,
  PagePending,
} from "./page-pending.tsx"
import { ProductBadge } from "./product-badge.tsx"
import { ProductRail } from "./product-rail.tsx"
import { useProductSwitch } from "./product-switch.ts"
import { HGDC_ACCOUNT, HGDC_PRODUCTS } from "./products.ts"
import { ProductRailShownContext, ShellLeaveContext, StatusPageContext } from "./shell-placement.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { cn } from "./cn.ts"
import { ServiceStatus, statusPageUrlFor } from "./service-status.tsx"
import { useMediaQuery } from "./use-media-query.ts"

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

// ── Accès communs, au-dessus du compte ──────────────────────────────────────────────────

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

function ShellCommonLinks({
  links,
  statusPageUrl,
}: {
  links: AppShellLinks
  statusPageUrl: string | null
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
      </ul>
    </nav>
  )
}

// ── Assistant ─────────────────────────────────────────────────────────────────────────

/**
 * L'assistant IA du produit. La coque pose son bouton juste à côté de la recherche et l'ouvre dans
 * une colonne à droite de la page, sur le fond de l'application : la page se rétrécit et se
 * réorganise, jamais recouverte. Sous 1280 px, là où les deux ne tiennent plus côte à côte, une
 * vue dédiée plein écran avec « Retour à la page ». La page reste montée dans les deux cas, et le
 * panneau, une fois ouvert, aussi : rien ne se perd en fermant ou en changeant de largeur.
 */
export type AppShellAssistant = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Le corps de l'assistant : conversation et saisie (`@hgdc/ui/assistant-chat`). La coque pose le
   * titre, la fermeture et le retour à la page ; le panneau occupe la hauteur restante et défile.
   */
  panel: ReactNode
  /** Nom du bouton et titre du panneau : « Assistant » par défaut. */
  label?: string
  /** Lettre du raccourci `Ctrl` (`⌘`) + lettre qui ouvre et ferme l'assistant (`"j"`). Aucun par défaut. */
  shortcut?: string
}

/** Largeur à partir de laquelle la page et l'assistant tiennent côte à côte (`xl`). */
const ASSISTANT_SIDE_BY_SIDE = "(min-width: 80rem)"

const FOCUSABLE = 'textarea, input, [contenteditable="true"], [autofocus]'

function AssistantButton({
  assistant,
  panelId,
  buttonRef,
}: {
  assistant: AppShellAssistant
  panelId: string
  buttonRef: React.RefObject<HTMLButtonElement | null>
}): React.JSX.Element {
  const label = assistant.label ?? "Assistant"
  const letter = assistant.shortcut?.toUpperCase()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={buttonRef}
            type="button"
            data-slot="app-shell-assistant-button"
            aria-expanded={assistant.open}
            aria-controls={panelId}
            {...(letter ? { "aria-keyshortcuts": `Control+${letter} Meta+${letter}` } : {})}
            onClick={() => assistant.onOpenChange(!assistant.open)}
            className={cn(
              "touch-target flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none",
              "transition-colors duration-(--duration-fast) ease-out hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              "aria-expanded:bg-foreground/[0.08] aria-expanded:text-foreground",
              "max-lg:w-9 max-lg:justify-center max-lg:px-0",
            )}
          />
        }
      >
        <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} aria-hidden className="size-[1.125rem] shrink-0" />
        <span className="max-lg:sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-2">
          {assistant.open ? `Fermer ${label.toLocaleLowerCase("fr-CH")}` : label}
          {letter ? (
            <KbdGroup>
              <Kbd>{isApplePlatform() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>{letter}</Kbd>
            </KbdGroup>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/** `Ctrl` (`⌘`) + la lettre de l'assistant : l'ouvre ou le ferme, où que soit le focus. */
function useAssistantShortcut(assistant: AppShellAssistant | undefined): void {
  const latest = useRef(assistant)
  useEffect(() => {
    latest.current = assistant
  })
  const letter = assistant?.shortcut?.toLowerCase()
  useEffect(() => {
    if (!letter) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== letter || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return
      const current = latest.current
      if (!current) return
      event.preventDefault()
      current.onOpenChange(!current.open)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [letter])
}

function AssistantPanel({
  assistant,
  panelId,
  wide,
  openAtShellMount,
  buttonRef,
}: {
  assistant: AppShellAssistant
  panelId: string
  wide: boolean
  openAtShellMount: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
}): React.JSX.Element {
  const { open, onOpenChange } = assistant
  const label = assistant.label ?? "Assistant"
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  // Ouvert dès le premier rendu de la coque (état restauré) : le focus reste où le navigateur le met.
  const wasOpen = useRef(openAtShellMount)

  // Ouvert : le focus entre dans le panneau (sa saisie, sinon le panneau). Fermé : il revient au
  // bouton, s'il était dans le panneau ou perdu sur la page.
  useEffect(() => {
    const panel = panelRef.current
    if (open && !wasOpen.current && panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel
      target.focus({ preventScroll: true })
    }
    if (!open && wasOpen.current) {
      const active = document.activeElement
      if (!active || active === document.body || panel?.contains(active)) buttonRef.current?.focus()
    }
    wasOpen.current = open
  }, [open, buttonRef])

  // Échap, le focus dans le panneau : il se ferme (sauf si un élément du panneau l'a déjà traité).
  useEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      onOpenChange(false)
    }
    panel.addEventListener("keydown", onKey)
    return () => panel.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const close = () => onOpenChange(false)
  return (
    <section
      ref={panelRef}
      id={panelId}
      tabIndex={-1}
      data-slot="app-shell-assistant"
      data-open={open ? "" : undefined}
      aria-labelledby={titleId}
      inert={!open || undefined}
      {...(open && !wide ? { role: "dialog", "aria-modal": true } : {})}
      className={cn(
        "outline-none",
        // Vue dédiée, sous 1280 px : plein écran, la page reste montée dessous.
        "hidden data-open:max-xl:fixed data-open:max-xl:inset-0 data-open:max-xl:z-40 data-open:max-xl:flex data-open:max-xl:flex-col data-open:max-xl:bg-background",
        "data-open:max-xl:pt-[env(safe-area-inset-top,0px)] data-open:max-xl:soft-in motion-reduce:animate-none",
        // Côte à côte : une colonne de la grille, qui s'ouvre en largeur ; la page se réorganise.
        "xl:invisible xl:flex xl:w-0 xl:flex-col xl:overflow-hidden xl:transition-[width,visibility] xl:duration-(--duration-slow) xl:ease-ios motion-reduce:transition-none",
        "xl:data-open:visible xl:data-open:w-[26rem] 2xl:data-open:w-[28rem]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col xl:w-[26rem] xl:py-2 xl:pr-2 2xl:w-[28rem]">
        <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-foreground/5 px-2 sm:px-4 xl:border-0 xl:pr-1 xl:pl-3">
          <button
            type="button"
            onClick={close}
            className="touch-target flex h-9 shrink-0 items-center gap-1.5 rounded-xl pr-3 pl-2 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 xl:hidden"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden className="size-4" />
            Retour à la page
          </button>
          <h2
            id={titleId}
            className="flex min-w-0 flex-1 items-center gap-2 truncate font-heading text-[0.9375rem] font-semibold max-xl:justify-end max-xl:pr-2"
          >
            <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} aria-hidden className="size-[1.125rem] shrink-0" />
            {label}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={`Fermer ${label.toLocaleLowerCase("fr-CH")}`}
            className="touch-target grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-shell-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-xl:hidden"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} aria-hidden className="size-[1.125rem]" />
          </button>
        </div>
        <div data-slot="app-shell-assistant-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {assistant.panel}
        </div>
      </div>
    </section>
  )
}

// ── Coque ─────────────────────────────────────────────────────────────────────────────

// Les noms de Hugeicons disent l'état du panneau, pas le geste : « Open » dessine la flèche vers la
// gauche (réduire), « Close » vers la droite (déplier).
const COLLAPSE_ICON = PanelLeftOpenIcon
const EXPAND_ICON = PanelLeftCloseIcon

/** Même boîte qu'une entrée de la barre en rail : 40 × 36 px, icône de 18 px centrée. */
const TOGGLE =
  "touch-target relative grid h-9 w-10 shrink-0 place-items-center rounded-xl text-shell-muted outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-shell-hover hover:text-shell-foreground focus-visible:ring-2 focus-visible:ring-ring/50"

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
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** Faux au rendu serveur et à l'hydratation, vrai avant la première image qui suit. */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useIsomorphicLayoutEffect(() => setHydrated(true), [])
  return hydrated
}

/**
 * Le chargement de la zone de contenu : `navigating` après 50 ms, `pending` aussitôt, puis au
 * moins 300 ms. Effets de mise en page : une page qui passe en attente est couverte avant d'être
 * peinte, jamais une image vide entre les deux.
 */
function useContentLoading({ navigating, pending }: { navigating: boolean; pending: boolean }): boolean {
  const [navigatingLong, setNavigatingLong] = useState(false)
  useEffect(() => {
    if (!navigating) return undefined
    const timer = window.setTimeout(() => setNavigatingLong(true), PAGE_PENDING_MS)
    return () => {
      window.clearTimeout(timer)
      setNavigatingLong(false)
    }
  }, [navigating])
  const active = pending || (navigating && navigatingLong)
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)
  useIsomorphicLayoutEffect(() => {
    if (active && !visible) {
      shownAt.current = performance.now()
      setVisible(true)
      return undefined
    }
    if (!active && visible) {
      const timer = window.setTimeout(
        () => setVisible(false),
        Math.max(0, shownAt.current + PAGE_PENDING_MIN_MS - performance.now()),
      )
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [active, visible])
  return visible
}

export function AppShell({
  product,
  organization,
  productRail = true,
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
  /**
   * Documentation, Réglages et État du service, juste au-dessus du compte, dans cet ordre, chacun
   * optionnel (État du service suit `statusPage` par défaut).
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
   * de test), ou `false` pour ne rien lire. L'accès « État du service », au-dessus du compte, y mène.
   */
  statusPage?: string | false | undefined
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  // Barre des produits élargie : la barre latérale se plie le temps du survol (ADR 0011).
  const [railPeek, setRailPeek] = useState(false)
  useToggleShortcut()
  // Relecture des organisations après un passage depuis la barre, préchargement des autres produits (ADR 0016).
  useProductSwitch(productRail)

  // Chargement de la zone de contenu (ADR 0015) : une navigation en cours (après 50 ms), une page
  // qui attend (`PagePending`, aussitôt : le routeur a déjà attendu), ou le départ vers un autre
  // produit (aussitôt). Une fois montré, au moins 300 ms. Le H est celui du document, en position
  // fixe : il ne bouge pas d'un état à l'autre et n'est jamais démonté.
  const [leaving, setLeaving] = useState(false)
  const [pagePending, setPagePending] = useState(0)
  const registerPagePending = useCallback(() => {
    setPagePending((count) => count + 1)
    return () => setPagePending((count) => count - 1)
  }, [])
  const leave = useCallback(() => setLeaving(true), [])
  useEffect(() => {
    // Retour arrière depuis l'autre produit (cache de page) : la page revient telle quelle.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaving(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])
  const statusPageUrl = statusPage === false ? null : (statusPage ?? statusPageUrlFor(product))
  const loading = useContentLoading({ navigating, pending: pagePending > 0 || leaving })
  // Avant l'hydratation, le CSS montre le calque et le H dès qu'une page attend (`:has`) ; ensuite
  // `data-loading` prend le relais dans la même image.
  const hydrated = useHydrated()
  const hasRoot = useContext(FamilyLoaderRootContext)
  const contentRef = useRef<HTMLDivElement>(null)
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

  const footer = (
    <>
      {account !== undefined ? sidebarFooter : null}
      <ShellCommonLinks links={links ?? {}} statusPageUrl={statusPageUrl} />
      {account ?? sidebarFooter}
    </>
  )

  return (
    <ShellContext.Provider value={{ closeMobileNav: () => setMenuOpen(false) }}>
      <ProductRailShownContext value={productRail}>
        <ShellLeaveContext value={leave}>
          <StatusPageContext value={statusPageUrl}>
            <div
              data-slot="app-shell"
              data-rail-peek={railPeek ? "" : undefined}
              data-product-rail={productRail ? "" : undefined}
              data-loading={loading ? "" : undefined}
              data-hydrated={hydrated ? "" : undefined}
              data-assistant={assistantOpen ? "" : undefined}
              className={cn(
                "min-h-dvh lg:grid lg:h-dvh lg:bg-shell",
                productRail ? "lg:grid-cols-[auto_auto_minmax(0,1fr)_auto]" : "lg:grid-cols-[auto_minmax(0,1fr)_auto]",
              )}
            >
              <a
                href="#contenu"
                className="sr-only z-50 rounded-xl bg-background px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
              >
                Aller au contenu
              </a>
              {productRail ? (
                <div className="contents" inert={pageBlocked || undefined}>
                  <ProductRail
                    current={product}
                    organization={organization}
                    accountHref={accountHref}
                    onExpandedChange={setRailPeek}
                  />
                </div>
              ) : null}
              <aside
                aria-label="Barre latérale"
                inert={pageBlocked || undefined}
                className="group/sidebar hidden overflow-hidden text-shell-foreground transition-[width] duration-(--duration-base) ease-ios motion-reduce:transition-none lg:flex lg:w-64 lg:flex-col lg:rail:w-16"
              >
                <SidebarHead product={product} />
                {!productRail && organization ? <div className="shrink-0 px-3 pb-1">{organization}</div> : null}
                {nav}
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
                  <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex min-h-14 shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-foreground/5 bg-background px-2 py-1.5 sm:px-4 lg:top-0">
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
                  {nav}
                  <div className="grid gap-0.5 border-t border-foreground/5 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] empty:hidden">
                    {footer}
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </StatusPageContext>
        </ShellLeaveContext>
      </ProductRailShownContext>
    </ShellContext.Provider>
  )
}
