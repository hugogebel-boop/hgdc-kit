import { FAMILY_PRODUCTS } from "./family-svg.ts"
import { OrgPlaceholder } from "./org-placeholder.tsx"
import { ProductBadge } from "./product-badge.tsx"
import { familyProductName } from "./product-name.ts"

export { familyProductName } from "./product-name.ts"

/** Haut de la barre latérale (marque du produit) : le même dans la coque et dans le cadre. */
export const SIDEBAR_HEAD = "mt-2 flex h-14 shrink-0 items-center gap-1 px-3"
export const SIDEBAR_BRAND = "flex min-w-0 flex-1 items-center gap-2.5 pl-2.25"
export const SIDEBAR_BRAND_NAME = "truncate font-heading text-[0.9375rem] font-semibold"
/** Même boîte qu'une entrée de la barre en rail : 40 × 36 px. */
export const SIDEBAR_RAIL_BOX = "grid h-9 w-10 shrink-0 place-items-center rounded-xl"

/** Lignes de squelette de la navigation, coupées à la hauteur retenue (`--hgdc-nav-height`). */
const SKELETON_ROWS = 12

/** Une ligne de la barre sans lien : même boîte qu'une entrée. */
const FRAME_ROW = "flex h-9 shrink-0 items-center gap-2.5 px-3 text-sm font-medium text-shell-muted"

/**
 * Le cadre de la coque, dessiné par le chargeur du document (`FamilyLoaderRoot`) quand une page
 * attend hors de la coque : organisation retenue, Manager, retour aux modules, nom du module,
 * navigation en squelette à sa hauteur retenue, carte du contenu et sa barre du haut. Mêmes boîtes
 * que la coque, au pixel : la transition de vue d'un module à l'autre n'a rien à faire bouger, et
 * la coque qui monte ensuite prend la place sans saut.
 *
 * Le produit vient de l'adresse (`<html data-hgdc-product>`, `sidebarInitScript`) : le rendu
 * serveur dessine tous les noms, le CSS montre le bon.
 */
export function ShellFrame(): React.JSX.Element {
  return (
    <div data-slot="shell-frame" aria-hidden className="hidden h-full lg:flex">
      <div data-slot="shell-frame-sidebar" className="flex w-64 shrink-0 flex-col overflow-hidden rail:w-16">
        <div className={SIDEBAR_HEAD}>
          <OrgPlaceholder />
        </div>
        <div className="px-3 pt-1">
          <div className={FRAME_ROW}>
            <span className="size-[1.125rem] shrink-0 rounded-md bg-shell-hover" />
            <span className="rail:hidden">Manager</span>
          </div>
          <div className="mx-2 mt-2 h-px bg-foreground/8" />
        </div>
        <div className="px-3 pt-2">
          <div className={`${FRAME_ROW} mb-2 rounded-xl bg-shell-hover text-shell-foreground`}>
            <span className="size-4 shrink-0" />
            <span className="rail:hidden">Retour aux modules</span>
          </div>
          {FAMILY_PRODUCTS.map((product) => (
            <div key={product} data-product={product} className="contents">
              <div className={`${FRAME_ROW} font-semibold text-shell-foreground rail:hidden`}>
                <ProductBadge product={product} className="size-[1.125rem] shrink-0" />
                <span className="truncate font-heading">{familyProductName(product)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2">
          <div data-slot="shell-frame-nav" className="grid gap-0.5 overflow-hidden">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <div key={index} className="flex h-9 shrink-0 items-center gap-2.5 px-3 rail:justify-center rail:px-0">
                <span className="size-[1.125rem] shrink-0 rounded-md bg-shell-hover" />
                <span className="h-2.5 w-24 rounded-full bg-shell-hover rail:hidden" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-2 pr-2">
        <div className="h-full overflow-hidden rounded-xl bg-background">
          <div data-slot="shell-frame-header" className="min-h-14 border-b border-foreground/5 bg-background" />
        </div>
      </div>
    </div>
  )
}
