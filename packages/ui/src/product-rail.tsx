import { useEffect, useRef, useState, type ReactNode } from "react"

import { ProductBadge } from "./product-badge.tsx"
import { productRailEntries, type HgdcCatalogProduct, type ProductRailEntry } from "./products.ts"
import { ShellPlacementContext } from "./shell-placement.ts"
import { cn } from "./cn.ts"

/** Délai d'intention avant d'élargir la barre au survol : un passage de souris ne l'ouvre pas. */
export const PRODUCT_RAIL_OPEN_DELAY = 150

function ProductLink({ entry }: { entry: ProductRailEntry }): React.JSX.Element {
  return (
    <li>
      <a
        href={entry.href}
        aria-current={entry.current ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-xl px-2 text-shell-muted outline-none transition-colors duration-(--duration-fast) ease-out",
          "hover:bg-shell-hover hover:text-shell-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          "aria-[current=page]:bg-shell-active aria-[current=page]:text-shell-foreground",
        )}
      >
        <ProductBadge product={entry.badge} className="size-6" />
        <span className="min-w-0 flex-1 truncate opacity-0 transition-opacity duration-(--duration-fast) ease-out group-data-expanded/rail:opacity-100 motion-reduce:transition-none">
          <span className="font-heading text-sm font-medium">{entry.name}</span>
          {entry.hint ? <span className="sr-only">, </span> : null}
          {entry.hint ? <span className="ml-1.5 text-xs text-shell-muted">{entry.hint}</span> : null}
        </span>
      </a>
    </li>
  )
}

/**
 * La barre des produits de la famille, tout à gauche de la coque sur ordinateur : organisation en
 * haut, Account, puis les pastilles des produits. 56 px de large ; au survol (après un court délai
 * d'intention) ou au focus clavier, elle s'élargit et écrit le nom de chaque produit. Elle ne
 * recouvre jamais la page : `AppShell` plie la barre latérale du produit le temps du survol, la
 * barre prend exactement la place libérée (248 px) ; si la barre latérale est déjà pliée, elle
 * pousse la page (220 px). Tout revient dès que la souris sort.
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
  /** `OrgSwitcher`, rendu compact. */
  organization?: ReactNode
  /** Adresse d'Account (un Account local en développement). */
  accountHref?: string | undefined
  catalog?: ReadonlyArray<HgdcCatalogProduct> | undefined
  /** Prévenu à chaque ouverture et fermeture : `AppShell` y plie sa barre latérale. */
  onExpandedChange?: ((expanded: boolean) => void) | undefined
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])
  const ref = useRef<HTMLElement>(null)
  const { products, account } = productRailEntries({ current, accountHref, catalog })

  // Écouteurs natifs : la barre est un repère `nav`, pas un contrôle ; c'est son survol et le
  // focus de ses liens qui l'élargissent.
  useEffect(() => {
    const rail = ref.current
    if (!rail) return
    let timer: number | undefined
    const cancel = () => {
      window.clearTimeout(timer)
      timer = undefined
    }
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      cancel()
      timer = window.setTimeout(() => setExpanded(true), PRODUCT_RAIL_OPEN_DELAY)
    }
    const onLeave = () => {
      cancel()
      setExpanded(false)
    }
    // Au clavier seulement : un clic de souris ne laisse pas la barre ouverte.
    const onFocusIn = (event: FocusEvent) => {
      if (event.target && focusVisible(event.target)) setExpanded(true)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !rail.contains(event.relatedTarget)) setExpanded(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      cancel()
      setExpanded(false)
    }
    rail.addEventListener("pointerenter", onEnter)
    rail.addEventListener("pointerleave", onLeave)
    rail.addEventListener("focusin", onFocusIn)
    rail.addEventListener("focusout", onFocusOut)
    rail.addEventListener("keydown", onKey)
    return () => {
      cancel()
      rail.removeEventListener("pointerenter", onEnter)
      rail.removeEventListener("pointerleave", onLeave)
      rail.removeEventListener("focusin", onFocusIn)
      rail.removeEventListener("focusout", onFocusOut)
      rail.removeEventListener("keydown", onKey)
    }
  }, [])

  return (
    <div
      data-slot="product-rail"
      data-expanded={expanded ? "" : undefined}
      className={cn(
        "hidden w-14 shrink-0 overflow-hidden lg:block",
        // Même durée et même courbe que la barre latérale qui se plie : la somme des deux largeurs
        // reste constante (56 + 256 = 248 + 64), la page ne bouge pas.
        "transition-[width] duration-(--duration-base) ease-ios motion-reduce:transition-none",
        "data-expanded:w-62 folded:data-expanded:w-55",
      )}
    >
      <nav
        ref={ref}
        aria-label="Produits"
        data-expanded={expanded ? "" : undefined}
        className="group/rail flex h-full w-full flex-col gap-2 overflow-hidden bg-shell-rail px-2 py-3 text-shell-foreground"
      >
        {organization ? (
          <>
            <ShellPlacementContext value="product-rail">{organization}</ShellPlacementContext>
            <div aria-hidden className="mx-2 h-px shrink-0 bg-foreground/8" />
          </>
        ) : null}
        {/* Account en tête, sous l'organisation : en bas, personne ne le voyait. */}
        <ul className="grid min-h-0 gap-1 overflow-x-hidden overflow-y-auto">
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
