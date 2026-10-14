import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon"
import PanelLeftCloseIcon from "@hugeicons/core-free-icons/PanelLeftCloseIcon"
import PanelLeftOpenIcon from "@hugeicons/core-free-icons/PanelLeftOpenIcon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useRender } from "@base-ui/react/use-render"
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"

import { Drawer, DrawerContent, DrawerTitle } from "./drawer.tsx"
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

/**
 * La coque commune des consoles HGDC, celle de Host. Sur ordinateur : colonne teintée à gauche
 * (organisation en haut, navigation, compte en bas), réductible en rail (`Ctrl+B`, mémorisé), et
 * la page sur une carte à côté. Sur téléphone : une barre en haut, le menu dans un tiroir qui
 * monte du bas et se referme quand on choisit une page.
 *
 * Le kit ne connaît ni le routeur ni l'authentification : le produit passe ses éléments
 * (`OrgSwitcher`, `SidebarNav`, `AccountMenu`) et ses liens.
 */
export function AppShell({
  sidebarHeader,
  nav,
  sidebarFooter,
  header,
  children,
  mainClassName,
}: {
  /** Haut de la barre : `OrgSwitcher`. */
  sidebarHeader?: ReactNode
  /** `SidebarNav` et ses `SidebarNavItem`. */
  nav: ReactNode
  /** Bas de la barre : liens secondaires (Docs, Paramètres) et `AccountMenu`. */
  sidebarFooter?: ReactNode
  /** Barre du haut de la page : sélecteur de projet, recherche (`CommandMenuButton`). */
  header?: ReactNode
  children: ReactNode
  /** Largeur et marges du contenu : `max-w-6xl` par défaut. */
  mainClassName?: string
}): React.JSX.Element {
  const rail = useSidebarRail()
  const [menuOpen, setMenuOpen] = useState(false)
  useToggleShortcut()

  return (
    <ShellContext.Provider value={{ closeMobileNav: () => setMenuOpen(false) }}>
      <div data-slot="app-shell" className="min-h-dvh lg:grid lg:h-dvh lg:grid-cols-[auto_minmax(0,1fr)] lg:bg-shell">
        <a
          href="#contenu"
          className="sr-only z-50 rounded-xl bg-background px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
        >
          Aller au contenu
        </a>
        <aside
          aria-label="Barre latérale"
          className="hidden overflow-hidden text-shell-foreground transition-[width] duration-(--duration-drawer) ease-ios motion-reduce:transition-none lg:flex lg:w-64 lg:flex-col lg:rail:w-16"
        >
          <div className="mt-2 flex min-h-14 shrink-0 items-center gap-1 px-3 rail:flex-col rail:justify-center rail:px-0 rail:py-1">
            <div className="min-w-0 flex-1 rail:flex-none">{sidebarHeader}</div>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={rail ? "Déplier la barre latérale" : "Réduire la barre latérale"}
              aria-keyshortcuts="Control+B Meta+B"
              title={rail ? "Déplier (Ctrl+B)" : "Réduire (Ctrl+B)"}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-shell-muted outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-shell-hover hover:text-shell-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.96]"
            >
              <HugeiconsIcon
                icon={rail ? PanelLeftCloseIcon : PanelLeftOpenIcon}
                strokeWidth={1.8}
                aria-hidden
                className="size-[1.125rem]"
              />
            </button>
          </div>
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
              <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
            </header>
            <main
              id="contenu"
              tabIndex={-1}
              className={cn(
                "mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-8",
                mainClassName,
              )}
            >
              {children}
            </main>
          </div>
        </div>

        <Drawer side="bottom" open={menuOpen} onOpenChange={setMenuOpen}>
          <DrawerContent className="lg:hidden">
            <DrawerTitle className="sr-only">Menu</DrawerTitle>
            {sidebarHeader ? <div className="px-3 pt-1">{sidebarHeader}</div> : null}
            {nav}
            {sidebarFooter ? (
              <div className="grid gap-0.5 border-t border-foreground/5 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                {sidebarFooter}
              </div>
            ) : null}
          </DrawerContent>
        </Drawer>
      </div>
    </ShellContext.Provider>
  )
}
