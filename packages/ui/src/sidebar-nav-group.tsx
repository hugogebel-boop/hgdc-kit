import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { cn } from "./cn.ts"
import { ShellContext } from "./shell-context.ts"

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
