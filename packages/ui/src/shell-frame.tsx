import { FAMILY_PRODUCTS, type FamilyProduct } from "./family-svg.ts"
import { ProductBadge } from "./product-badge.tsx"
import { ProductRailFrame } from "./product-rail.tsx"
import { HGDC_ACCOUNT, HGDC_PRODUCTS } from "./products.ts"

/** Nom affiché d'un produit de la famille (« Mail »), Account compris. */
export function familyProductName(product: FamilyProduct): string {
  if (product === HGDC_ACCOUNT.badge) return HGDC_ACCOUNT.name
  return HGDC_PRODUCTS.find((item) => item.badge === product)?.name ?? `HGDC ${product}`
}

/** Haut de la barre latérale (marque du produit) : le même dans la coque et dans le cadre. */
export const SIDEBAR_HEAD = "mt-2 flex h-14 shrink-0 items-center gap-1 px-3"
export const SIDEBAR_BRAND = "flex min-w-0 flex-1 items-center gap-2.5 pl-2.25"
export const SIDEBAR_BRAND_NAME = "truncate font-heading text-[0.9375rem] font-semibold"
/** Même boîte qu'une entrée de la barre en rail : 40 × 36 px. */
export const SIDEBAR_RAIL_BOX = "grid h-9 w-10 shrink-0 place-items-center rounded-xl"

/** Lignes de squelette de la navigation, coupées à la hauteur retenue (`--hgdc-nav-height`). */
const SKELETON_ROWS = 12

/**
 * Le cadre de la coque, dessiné par le chargeur du document (`FamilyLoaderRoot`) quand une page
 * attend hors de la coque : barre des produits complète (organisation retenue, pastilles, produit
 * courant), barre latérale du produit (sa marque, la navigation en squelette à sa hauteur
 * retenue), carte du contenu et sa barre du haut. Mêmes boîtes que la coque, au pixel : la
 * transition de vue d'un produit à l'autre n'a rien à faire bouger, et la coque qui monte ensuite
 * prend la place sans saut.
 *
 * Le produit vient de l'adresse (`<html data-hgdc-product>`, `sidebarInitScript`) : le rendu
 * serveur dessine toutes les marques, le CSS montre la bonne.
 */
export function ShellFrame(): React.JSX.Element {
  return (
    <div data-slot="shell-frame" aria-hidden className="hidden h-full lg:flex">
      <ProductRailFrame />
      <div data-slot="shell-frame-sidebar" className="flex w-64 shrink-0 flex-col overflow-hidden rail:w-16">
        <div className={SIDEBAR_HEAD}>
          {FAMILY_PRODUCTS.map((product) => (
            <div key={product} data-product={product} className="contents">
              <div className={`${SIDEBAR_BRAND} rail:hidden`}>
                <ProductBadge product={product} className="size-6" />
                <span className={SIDEBAR_BRAND_NAME}>{familyProductName(product)}</span>
              </div>
              <div className={`${SIDEBAR_RAIL_BOX} hidden rail:grid`}>
                <ProductBadge product={product} className="size-6" />
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
