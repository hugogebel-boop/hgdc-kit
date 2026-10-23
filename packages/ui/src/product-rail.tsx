import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { ProductBadge } from "./product-badge.tsx"
import { PRODUCT_PRERENDER_ATTRIBUTE } from "./product-switch.ts"
import { productRailEntries, type HgdcCatalogProduct, type ProductRailEntry } from "./products.ts"
import { markProductSwitch, takeProductSwitch } from "./shell-memory.ts"
import { ShellPlacementContext, useLeaveOnClick } from "./shell-placement.ts"
import { cn } from "./cn.ts"

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const noSubscription = () => () => {}

/** `location.origin` après l'hydratation, `undefined` au rendu serveur (liens absolus d'abord). */
function usePageOrigin(): string | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => undefined,
  )
}

/** Délai d'intention avant d'élargir la barre au survol : un passage de souris ne l'ouvre pas. */
export const PRODUCT_RAIL_OPEN_DELAY = 150

/** Boîte d'une entrée de la barre : la même pour un lien et pour sa place dans le cadre de chargement. */
const PRODUCT_ITEM = "flex h-10 items-center gap-3 rounded-xl px-2 text-shell-muted coarse:h-11"

/** Colonne de la barre (56 px) et son contenu : les mêmes pour la barre et pour le cadre de chargement. */
const RAIL_COLUMN = "hidden w-14 shrink-0 overflow-hidden lg:block"
const RAIL_INNER =
  "group/rail flex h-full w-full flex-col gap-2 overflow-hidden bg-shell-rail px-2 py-3 text-shell-foreground"
const RAIL_LIST = "grid min-h-0 gap-1 overflow-x-hidden overflow-y-auto"

function ProductLabel({ entry }: { entry: ProductRailEntry }): React.JSX.Element {
  return (
    <>
      <ProductBadge product={entry.badge} className="size-6" />
      <span className="min-w-0 flex-1 truncate opacity-0 transition-opacity duration-(--duration-fast) ease-out group-data-expanded/rail:opacity-100 motion-reduce:transition-none">
        <span className="font-heading text-sm font-medium">{entry.name}</span>
        {entry.hint ? <span className="sr-only">, </span> : null}
        {entry.hint ? <span className="ml-1.5 text-xs text-shell-muted">{entry.hint}</span> : null}
      </span>
    </>
  )
}

function ProductLink({ entry }: { entry: ProductRailEntry }): React.JSX.Element {
  // Chaque produit s'ouvre en document complet : la coque montre le H dès le clic.
  const leaveOnClick = useLeaveOnClick()
  return (
    <li>
      <a
        href={entry.href}
        onClick={leaveOnClick}
        {...(entry.sameOrigin ? { [PRODUCT_PRERENDER_ATTRIBUTE]: "" } : {})}
        aria-current={entry.current ? "page" : undefined}
        className={cn(
          PRODUCT_ITEM,
          "outline-none transition-colors duration-(--duration-fast) ease-out",
          "hover:bg-shell-hover hover:text-shell-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          "aria-[current=page]:bg-shell-active aria-[current=page]:text-shell-foreground",
        )}
      >
        <ProductLabel entry={entry} />
      </a>
    </li>
  )
}

/**
 * La place de l'organisation tant que le produit ne l'a pas (ses données arrivent) : la marque de
 * la dernière organisation affichée sous cette origine, au pixel près de celle d'`OrgSwitcher`
 * (initiales ou logo, posés sur `<html>` par `sidebarInitScript` avant la première peinture),
 * sinon un carré de squelette de la même taille. Rien ne bouge quand la vraie arrive.
 */
export function OrgPlaceholder(): React.JSX.Element {
  return (
    <div data-slot="org-placeholder" aria-hidden className="flex h-10 w-full shrink-0 items-center px-1 coarse:h-11">
      <span
        data-slot="org-placeholder-mark"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold uppercase"
      />
    </div>
  )
}

function RailDivider(): React.JSX.Element {
  return <div aria-hidden className="mx-2 h-px shrink-0 bg-foreground/8" />
}

/**
 * La barre des produits du cadre de chargement (`FamilyLoaderRoot`, hors de la coque) : la même
 * colonne que `ProductRail` repliée, `OrgPlaceholder` en haut, les mêmes pastilles, sans liens. Le
 * produit courant est marqué par le CSS (`<html data-hgdc-product>`, posé par
 * `sidebarInitScript`) : au rendu serveur, le kit ne connaît pas l'adresse.
 */
export function ProductRailFrame(): React.JSX.Element {
  const { products, account } = productRailEntries()
  return (
    <div data-slot="shell-frame-rail" className={RAIL_COLUMN}>
      <div className={RAIL_INNER}>
        <OrgPlaceholder />
        <RailDivider />
        <ul className={RAIL_LIST}>
          {[account, ...products].map((entry) => (
            <li key={entry.badge}>
              <span data-product={entry.badge} className={PRODUCT_ITEM}>
                <ProductLabel entry={entry} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * La barre des produits de la famille, tout à gauche de la coque sur ordinateur : organisation en
 * haut, Account, puis les pastilles des produits. 56 px de large ; au survol (après un court délai
 * d'intention) ou au focus clavier, elle s'élargit et écrit le nom de chaque produit. Elle ne
 * recouvre jamais la page : `AppShell` plie la barre latérale du produit le temps du survol, la
 * barre prend exactement la place libérée (248 px) ; si la barre latérale est déjà pliée, elle
 * pousse la page (220 px). Un menu ouvert depuis la barre (sélecteur d'organisation) la garde
 * élargie ; tout revient quand la souris est sortie et que le menu est fermé.
 */
export function ProductRail({
  current,
  organization,
  accountHref,
  catalog,
  onExpandedChange,
}: {
  /** Le mot du produit affiché (« host ») : marqué en teinte. */
  current?: string | undefined
  /**
   * `OrgSwitcher`, rendu compact. Absent (`undefined` : les données du produit arrivent), sa
   * place est tenue par `OrgPlaceholder`. `null` : pas d'organisation, rien en haut.
   */
  organization?: ReactNode
  /** Adresse d'Account (un Account local en développement). */
  accountHref?: string | undefined
  catalog?: ReadonlyArray<HgdcCatalogProduct> | undefined
  /** Prévenu à chaque ouverture et fermeture : `AppShell` y plie sa barre latérale. */
  onExpandedChange?: ((expanded: boolean) => void) | undefined
}): React.JSX.Element {
  // Trois raisons de rester élargie : le survol (après le délai d'intention), le focus clavier, et
  // un menu ouvert depuis la barre (sélecteur d'organisation ou tout autre) : la souris qui quitte
  // la barre pour aller dans le menu ne doit pas la replier sous elle.
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const expanded = hovered || focused || menuOpen
  // Avant la peinture : la barre latérale se plie dans la même image que la barre s'élargit, les
  // deux transitions partent ensemble et la page ne bouge pas.
  useIsomorphicLayoutEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])
  const ref = useRef<HTMLElement>(null)
  const pageOrigin = usePageOrigin()
  const { products, account } = productRailEntries({ current, accountHref, catalog, pageOrigin })

  // Écouteurs natifs : la barre est un repère `nav`, pas un contrôle ; c'est son survol, le focus
  // de ses liens et les menus qu'elle ouvre qui l'élargissent.
  useEffect(() => {
    const rail = ref.current
    if (!rail) return
    let timer: number | undefined
    // Arrivée depuis la barre d'un autre produit, la souris restée dessus : la barre ne s'élargit
    // pas sous elle, il faut d'abord en sortir (ADR 0020).
    let arrivedUnderPointer = takeProductSwitch()
    const cancel = () => {
      window.clearTimeout(timer)
      timer = undefined
    }
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || arrivedUnderPointer) return
      cancel()
      timer = window.setTimeout(() => setHovered(true), PRODUCT_RAIL_OPEN_DELAY)
    }
    const onLeave = () => {
      arrivedUnderPointer = false
      cancel()
      setHovered(false)
    }
    // Au clavier seulement : un clic de souris ne laisse pas la barre ouverte, ni le focus rendu au
    // déclencheur quand un menu ouvert à la souris se ferme. La dernière interaction fait foi.
    let keyboard = false
    const onDocKey = () => {
      keyboard = true
    }
    const onDocPointer = () => {
      keyboard = false
    }
    const onFocusIn = (event: FocusEvent) => {
      if (keyboard && event.target && focusVisible(event.target)) setFocused(true)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !rail.contains(event.relatedTarget)) setFocused(false)
    }
    // Un produit choisi : la barre se replie comme un menu qui se ferme, pendant que l'autre produit
    // s'ouvre. La page d'arrivée la montre repliée : rien ne bouge au passage (ADR 0020).
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return
      // Repliée d'un coup, sans transition (`data-hgdc-switching`) : l'image de départ de la
      // transition de vue montre déjà la barre telle que la page d'arrivée la peint.
      document.documentElement.dataset.hgdcSwitching = ""
      markProductSwitch()
      cancel()
      setHovered(false)
      setFocused(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      cancel()
      setHovered(false)
      setFocused(false)
    }
    // Un menu ouvert depuis la barre : son déclencheur porte `aria-expanded="true"` (Base UI, Radix,
    // natif). Le menu lui-même vit dans un portail, hors de la barre : on suit donc le déclencheur.
    const syncMenu = () => setMenuOpen(rail.querySelector('[aria-expanded="true"]') !== null)
    const observer = new MutationObserver(syncMenu)
    observer.observe(rail, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"], childList: true })
    syncMenu()
    document.addEventListener("keydown", onDocKey, true)
    document.addEventListener("pointerdown", onDocPointer, true)
    rail.addEventListener("pointerenter", onEnter)
    rail.addEventListener("pointerleave", onLeave)
    rail.addEventListener("focusin", onFocusIn)
    rail.addEventListener("focusout", onFocusOut)
    rail.addEventListener("keydown", onKey)
    rail.addEventListener("click", onClick)
    return () => {
      cancel()
      observer.disconnect()
      document.removeEventListener("keydown", onDocKey, true)
      document.removeEventListener("pointerdown", onDocPointer, true)
      rail.removeEventListener("pointerenter", onEnter)
      rail.removeEventListener("pointerleave", onLeave)
      rail.removeEventListener("focusin", onFocusIn)
      rail.removeEventListener("focusout", onFocusOut)
      rail.removeEventListener("keydown", onKey)
      rail.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <div
      data-slot="product-rail"
      data-expanded={expanded ? "" : undefined}
      className={cn(
        RAIL_COLUMN,
        // Même durée et même courbe que la barre latérale qui se plie : la somme des deux largeurs
        // reste constante (56 + 256 = 248 + 64), la page ne bouge pas.
        "transition-[width] duration-(--duration-base) ease-ios motion-reduce:transition-none",
        "data-expanded:w-62 folded:data-expanded:w-55",
      )}
    >
      <nav ref={ref} aria-label="Produits" data-expanded={expanded ? "" : undefined} className={RAIL_INNER}>
        {organization === undefined ? (
          <>
            <OrgPlaceholder />
            <RailDivider />
          </>
        ) : organization ? (
          <>
            <ShellPlacementContext value="product-rail">{organization}</ShellPlacementContext>
            <RailDivider />
          </>
        ) : null}
        {/* Account en tête, sous l'organisation : en bas, personne ne le voyait. */}
        <ul className={RAIL_LIST}>
          <ProductLink entry={account} />
          {products.map((entry) => (
            <ProductLink key={entry.badge} entry={entry} />
          ))}
        </ul>
      </nav>
    </div>
  )
}

function focusVisible(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false
  try {
    return target.matches(":focus-visible")
  } catch {
    return true
  }
}
