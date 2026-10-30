import Activity01Icon from "@hugeicons/core-free-icons/Activity01Icon"
import AiMagicIcon from "@hugeicons/core-free-icons/AiMagicIcon"
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import LinkSquare02Icon from "@hugeicons/core-free-icons/LinkSquare02Icon"
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
import { viewFromHostname, soloHref, type ProductView } from "./addresses.ts"
import { ProductBadge } from "./product-badge.tsx"
import { productBarShown, useProductBarPreference, useProductBarSync } from "./product-bar.ts"
import { otherViewHref, otherViewLabel } from "./products.ts"
import { ProductRail } from "./product-rail.tsx"
import { useProductSwitch } from "./product-switch.ts"
import { ProductRailShownContext, ShellLeaveContext, StatusPageContext } from "./shell-placement.ts"
import { familyProductName, SIDEBAR_BRAND, SIDEBAR_BRAND_NAME, SIDEBAR_HEAD } from "./shell-frame.tsx"
import { rememberShellNavHeight, shellBootScript } from "./shell-memory.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { cn } from "./cn.ts"
import { ServiceStatus, statusPageUrlFor } from "./service-status.tsx"
import { useMediaQuery } from "./use-media-query.ts"

// ── Rail : la barre latérale réduite aux icônes, mémorisée par navigateur ──────────────

const RAIL_KEY = "sidebar"
const RAIL_EVENT = "sidebarchange"

/**
 * À poser dans le `<head>`, avec `themeInitScript` : avant la première peinture, il remet le
 * rail (la variante CSS `rail:` le lit, rien ne saute au chargement) et la mémoire de la coque
 * partagée sous la même origine (`shell-memory` : produit de l'adresse, dernière organisation,
 * hauteur de la navigation), que le cadre du chargeur et `OrgPlaceholder` lisent (ADR 0020).
 */
export const sidebarInitScript: string = shellBootScript()

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

const ShellContext = createContext<{ closeMobileNav: () => void; product?: FamilyProduct }>({
  closeMobileNav: () => {},
})

/** Pour fermer le tiroir mobile depuis un élément de la barre (un sélecteur, un bouton). */
export function useAppShell(): { closeMobileNav: () => void } {
  return useContext(ShellContext)
}

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

// ── Groupes repliables : ouverts ou fermés par la personne, mémorisés par navigateur ──────

const GROUP_KEY_PREFIX = "sidebar-group:"
const GROUP_EVENT = "sidebargroupchange"

function subscribeGroups(onChange: () => void): () => void {
  window.addEventListener(GROUP_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(GROUP_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

function readGroup(key: string): boolean | null {
  try {
    const value = localStorage.getItem(GROUP_KEY_PREFIX + key)
    return value === "open" ? true : value === "closed" ? false : null
  } catch {
    return null
  }
}

function writeGroup(key: string, open: boolean): void {
  try {
    localStorage.setItem(GROUP_KEY_PREFIX + key, open ? "open" : "closed")
  } catch {
    // Stockage bloqué : le choix vaut pour cette page seulement.
  }
  window.dispatchEvent(new Event(GROUP_EVENT))
}

/** Une entrée de la liste est-elle la page ouverte ? Suit les attributs que pose le routeur. */
function useActiveDescendant(ref: React.RefObject<HTMLElement | null>): boolean {
  const [active, setActive] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const read = () => setActive(element.querySelector('[aria-current="page"], [data-status="active"]') !== null)
    read()
    const observer = new MutationObserver(read)
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-current", "data-status"],
    })
    return () => observer.disconnect()
  }, [ref])
  return active
}

/**
 * Un groupe titré de la barre : « Suivi », « Réglages ». Ses `SidebarNavItem` en enfants. Le titre
 * nomme la liste pour les lecteurs d'écran ; en rail, il cède la place à un trait.
 *
 * Avec `collapsible`, le titre devient une entrée à flèche qui déroule ses rubriques : fermé par
 * défaut, ouvert dès qu'une de ses rubriques est la page ouverte, puis tel que la personne l'a
 * laissé (mémorisé par navigateur). En rail, ses rubriques restent visibles, sous un trait.
 */
export function SidebarNavGroup(props: {
  label: string
  children: ReactNode
  /** Le titre déroule ou replie le groupe. */
  collapsible?: false
}): React.JSX.Element
export function SidebarNavGroup(props: {
  label: string
  children: ReactNode
  collapsible: true
  /** Icône de l'entrée qui déroule le groupe, comme une rubrique. */
  icon?: IconSvgElement
  /**
   * Une rubrique du groupe est la page ouverte : le groupe s'ouvre, dès le rendu serveur. Sans cette
   * valeur, la coque le lit dans les liens (`aria-current="page"`, `data-status="active"`) après
   * l'hydratation.
   */
  active?: boolean
  /** Ouvert tant que la personne n'a rien choisi. Fermé par défaut. */
  defaultOpen?: boolean
  /** Clé de mémorisation, par défaut le titre, propre au produit de la coque : à donner quand deux groupes portent le même. */
  storageKey?: string
}): React.JSX.Element
export function SidebarNavGroup(props: {
  label: string
  children: ReactNode
  collapsible?: boolean
  icon?: IconSvgElement
  active?: boolean
  defaultOpen?: boolean
  storageKey?: string
}): React.JSX.Element {
  if (props.collapsible) return <CollapsibleNavGroup {...props} />
  return <TitledNavGroup label={props.label}>{props.children}</TitledNavGroup>
}

function CollapsibleNavGroup({
  label,
  children,
  icon,
  active,
  defaultOpen = false,
  storageKey,
}: {
  label: string
  children: ReactNode
  icon?: IconSvgElement
  active?: boolean
  defaultOpen?: boolean
  storageKey?: string
}): React.JSX.Element {
  // Propre au produit : sous une origine partagée (`app.hgdc.ch/<produit>`), `localStorage` est
  // commun à tous. Le thème et la barre réduite le sont volontairement (`theme`, `sidebar`), un
  // groupe « Réglages » de Mail et de Host ne l'est pas (ADR 0020).
  const { product } = useContext(ShellContext)
  const key = product ? `${product}:${storageKey ?? label}` : (storageKey ?? label)
  const buttonId = useId()
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const stored = useSyncExternalStore(
    subscribeGroups,
    () => readGroup(key),
    () => null,
  )
  const activeInDom = useActiveDescendant(listRef)
  const current = active ?? activeInDom
  // Refermé par la personne alors qu'une de ses rubriques est ouverte : il le reste jusqu'à ce
  // qu'elle en sorte. La navigation suivante vers une rubrique du groupe le rouvre.
  const [dismissed, setDismissed] = useState(false)
  const [wasCurrent, setWasCurrent] = useState(current)
  if (wasCurrent !== current) {
    setWasCurrent(current)
    setDismissed(false)
  }
  const open = current ? !dismissed : (stored ?? defaultOpen)
  // Pas d'animation au premier rendu : l'état lu dans le navigateur s'applique sans glisser.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const toggle = () => {
    const next = !open
    if (current) setDismissed(!next)
    writeGroup(key, next)
  }

  return (
    <li data-slot="sidebar-nav-group" data-collapsible="" data-open={open ? "" : undefined} className="pt-1 first:pt-0">
      <span aria-hidden className="mx-auto mt-3 mb-2 hidden h-px w-6 bg-border lg:rail:block" />
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        className={cn(
          "group/disclosure flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out",
          "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          "min-h-11 lg:min-h-9 coarse:min-h-11 lg:gap-2.5 lg:py-2 lg:text-shell-muted lg:hover:bg-shell-hover lg:hover:text-shell-foreground",
          // Une rubrique du groupe est ouverte et le groupe est replié : l'entrée le dit, sans fond.
          current && !open && "text-foreground lg:text-shell-foreground",
          "lg:rail:hidden",
        )}
      >
        {icon ? (
          <HugeiconsIcon icon={icon} strokeWidth={1.8} aria-hidden className="size-5 shrink-0 lg:size-[1.125rem]" />
        ) : null}
        <span className="truncate">{label}</span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 opacity-70 transition-transform duration-(--duration-base) ease-ios motion-reduce:transition-none lg:size-3.5",
            open && "rotate-90",
          )}
        />
      </button>
      <div
        data-slot="sidebar-nav-group-panel"
        className={cn(
          "grid",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
          ready &&
            "transition-[grid-template-rows,visibility] duration-(--duration-base) ease-ios motion-reduce:transition-none",
          // En rail, les rubriques restent là, sous le trait : seules leurs icônes se voient.
          "lg:rail:visible lg:rail:grid-rows-[1fr]",
        )}
      >
        <ul
          ref={listRef}
          id={listId}
          aria-labelledby={buttonId}
          className={cn(
            "grid min-h-0 gap-0.5 overflow-hidden",
            // Rubriques en retrait, sous un filet aligné sur l'icône du titre.
            icon ? "ml-[1.375rem] border-l border-border pl-2 lg:ml-5" : "pl-2",
            "pt-0.5 lg:rail:ml-0 lg:rail:border-l-0 lg:rail:pt-0 lg:rail:pl-0",
          )}
        >
          {children}
        </ul>
      </div>
    </li>
  )
}

function TitledNavGroup({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  const id = useId()
  return (
    <li data-slot="sidebar-nav-group" className="pt-4 first:pt-0">
      <p id={id} className="px-3 pb-1.5 text-xs font-medium text-muted-foreground lg:text-shell-muted lg:rail:sr-only">
        {label}
      </p>
      <span aria-hidden className="mx-auto mb-2 hidden h-px w-6 bg-border lg:rail:block" />
      <ul aria-labelledby={id} className="grid gap-0.5">
        {children}
      </ul>
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

/** Vue de la page : celle donnée par le serveur, sinon le nom de la page après l'hydratation. */
function useProductView(product: FamilyProduct, view: ProductView | undefined): ProductView {
  const fromHost = useSyncExternalStore(
    noSubscription,
    () => viewFromHostname(product, window.location.hostname),
    () => "app" as const,
  )
  return view ?? fromHost
}

const noSubscription = () => () => {}

/**
 * « Ouvrir seul » (vers `<mot>.hgdc.ch`) ou « Ouvrir dans app.hgdc.ch », discret, sous les accès communs.
 * Le chemin courant n'est lu qu'au clic : le lien rendu par le serveur mène à l'accueil.
 */
function OtherViewLink({ product, view }: { product: FamilyProduct; view: ProductView }): React.JSX.Element | null {
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

/**
 * Haut de la barre latérale. Dépliée : la marque du produit, et le bouton « Réduire » à droite.
 * En rail : la marque seule, qui devient le bouton « Déplier » au survol de la barre ou au focus,
 * à la même place : le bouton ne descend jamais sous le logo. Les deux états sont dans la page et
 * choisis par la variante CSS `rail:`, donc justes dès la première peinture.
 */
function SidebarHead({ product }: { product: FamilyProduct }): React.JSX.Element {
  return (
    <div className={SIDEBAR_HEAD}>
      <div data-slot="sidebar-brand" className={cn(SIDEBAR_BRAND, "rail:hidden")}>
        <ProductBadge product={product} className="size-6" />
        <span className={SIDEBAR_BRAND_NAME}>{familyProductName(product)}</span>
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

/**
 * Délai entre le clic vers un autre produit et le H : une page prérendue s'affiche avant (une ou
 * deux images), le H n'apparaît alors jamais ; une page à charger le montre aussitôt après.
 */
export const PRODUCT_LEAVE_DELAY_MS = 100

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
}: {
  /** Le produit affiché (`"host"`) : sa marque en haut de la barre, « vous êtes ici » dans la barre des produits. */
  product: FamilyProduct
  /**
   * `OrgSwitcher` : en haut de la barre des produits, en haut du tiroir sur téléphone. Absent
   * pendant que les données du produit arrivent : la barre lui garde sa place, avec la marque de
   * la dernière organisation affichée (`OrgPlaceholder`, ADR 0020). `null` : aucune organisation.
   */
  organization?: ReactNode
  /**
   * `false` : pas de barre des produits (un écran hors de la famille). L'organisation passe alors
   * sous la marque, dans la barre latérale. Absent : selon la vue et le réglage « Barre des produits »
   * d'Account (ADR 0014), relu par la coque.
   */
  productRail?: boolean
  /**
   * Vue de la page : `app` sous `app.hgdc.ch/<mot>`, `seul` sur `<mot>.hgdc.ch`. À donner depuis le
   * serveur (`requestView` de `@hgdc/auth/server`) pour un premier rendu juste ; absent : le nom de
   * la page, `app` au rendu serveur.
   */
  view?: ProductView | undefined
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
  const view = useProductView(product, viewOption)
  const preference = useProductBarPreference()
  useProductBarSync(productRailOption === undefined)
  const productRail = productRailOption ?? productBarShown(view, preference)
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
  // Après `PRODUCT_LEAVE_DELAY_MS` seulement : une page prérendue au survol s'affiche avant, sans
  // que le H apparaisse (ADR 0020). Sinon le H couvre le contenu jusqu'au départ de la page.
  const leaveTimer = useRef<number | undefined>(undefined)
  const leave = useCallback(() => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setLeaving(true), PRODUCT_LEAVE_DELAY_MS)
  }, [])
  useEffect(() => {
    // Retour arrière depuis l'autre produit (cache de page) : la page revient telle quelle.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      window.clearTimeout(leaveTimer.current)
      setLeaving(false)
      delete document.documentElement.dataset.hgdcSwitching
    }
    window.addEventListener("pageshow", onPageShow)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.clearTimeout(leaveTimer.current)
    }
  }, [])
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
  }, [product])
  const navHeight = useRef(0)
  useEffect(() => {
    const list = sidebarRef.current?.querySelector(":scope > nav > ul")
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

  const footer = (
    <>
      {account !== undefined ? sidebarFooter : null}
      <ShellCommonLinks
        links={links ?? {}}
        statusPageUrl={statusPageUrl}
        otherView={<OtherViewLink product={product} view={view} />}
      />
      {account ?? sidebarFooter}
    </>
  )

  return (
    <ShellContext.Provider value={{ closeMobileNav: () => setMenuOpen(false), product }}>
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
                ref={sidebarRef}
                data-slot="app-shell-sidebar"
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
                      <span className="font-heading text-[0.9375rem] font-semibold">{familyProductName(product)}</span>
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
