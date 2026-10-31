import PanelLeftCloseIcon from "@hugeicons/core-free-icons/PanelLeftCloseIcon"
import PanelLeftOpenIcon from "@hugeicons/core-free-icons/PanelLeftOpenIcon"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "./cn.ts"
import type { FamilyProduct } from "./family-svg.ts"
import { isApplePlatform, Kbd, KbdGroup } from "./kbd.tsx"
import { ProductBadge } from "./product-badge.tsx"
import { familyProductName, SIDEBAR_BRAND, SIDEBAR_BRAND_NAME, SIDEBAR_HEAD } from "./shell-frame.tsx"
import { toggleSidebar } from "./sidebar-rail.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"

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
export function SidebarHead({ product }: { product: FamilyProduct }): React.JSX.Element {
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
