import { cn } from "./cn.ts"
import { FAMILY_MARK_SVG, PRODUCT_BADGE_SVG, type FamilyProduct } from "./family-svg.ts"

/**
 * Dégradé de chaque pastille, du coin haut gauche au coin bas droit. Mêmes valeurs que les jetons
 * `--product-<mot>-from` / `--product-<mot>-to` de `styles.css` et que les SVG de `family/`.
 */
export const PRODUCT_GRADIENT: Readonly<Record<FamilyProduct, { from: string; to: string }>> = {
  account: { from: "#ff3b47", to: "#ff6352" },
  host: { from: "#194ff7", to: "#02b4ff" },
  mail: { from: "#f61f8e", to: "#ff5cb8" },
  portal: { from: "#4732ed", to: "#b03cff" },
  status: { from: "#199f62", to: "#56db29" },
  analytics: { from: "#fe5623", to: "#ffb003" },
  docs: { from: "#1bb9cf", to: "#13e4c8" },
}

// En image plutôt qu'en SVG en ligne : chaque pastille garde ses identifiants de dégradé pour elle,
// plusieurs pastilles dans une même page ne se marchent pas dessus.
function dataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

type MarkProps = {
  className?: string
  /** Texte de remplacement. Absent : image décorative, le nom du produit est écrit à côté. */
  label?: string
}

/**
 * Pastille d'un produit (dégradé plein, pictogramme blanc), toujours seule : jamais dans une tuile
 * de couleur. `size-4` par défaut, à agrandir par `className`.
 */
export function ProductBadge({ product, className, label }: MarkProps & { product: FamilyProduct }): React.JSX.Element {
  return (
    <img
      src={dataUri(PRODUCT_BADGE_SVG[product])}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={16}
      height={16}
      draggable={false}
      className={cn("size-4 shrink-0 select-none", className)}
    />
  )
}

/** Le H tricolore de la famille (« Propulsé par », hub). `size-4` par défaut. */
export function FamilyMark({ className, label }: MarkProps): React.JSX.Element {
  return (
    <img
      src={dataUri(FAMILY_MARK_SVG)}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={16}
      height={16}
      draggable={false}
      className={cn("size-4 shrink-0 select-none", className)}
    />
  )
}
