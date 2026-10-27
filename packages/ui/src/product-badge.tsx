import { cn } from "./cn.ts"
import { FAMILY_MARK_SVG, PRODUCT_BADGE_SVG, type FamilyProduct, type ThemedSvg } from "./family-svg.ts"

/**
 * Dégradé de chaque icône sur fond clair, de la teinte vive (haut gauche) à la teinte profonde (bas
 * droit). Mêmes valeurs que les jetons `--product-<mot>-from` / `--product-<mot>-to` de `styles.css`
 * et que les SVG de `family/`.
 */
export const PRODUCT_GRADIENT: Readonly<Record<FamilyProduct, { from: string; to: string }>> = {
  account: { from: "#ff6a3d", to: "#fc582e" },
  host: { from: "#3b7bff", to: "#2b63f2" },
  mail: { from: "#fa3a58", to: "#ec3052" },
  portal: { from: "#8b5cff", to: "#7b4bf7" },
  status: { from: "#11ce8b", to: "#09b077" },
  analytics: { from: "#ffb020", to: "#e58309" },
  docs: { from: "#0ec1dc", to: "#0aa3c1" },
  iassistant: { from: "#d946ef", to: "#c026d3" },
}

// En image plutôt qu'en SVG en ligne : chaque icône garde ses identifiants de dégradé pour elle,
// plusieurs icônes dans une même page ne se marchent pas dessus.
function dataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

type MarkProps = {
  className?: string
  /** Texte de remplacement. Absent : image décorative, le nom du produit est écrit à côté. */
  label?: string
}

/**
 * Les deux variantes du dessin, l'une sur fond clair, l'autre sur fond sombre (`.dark`) : le thème
 * choisit par CSS, sans JavaScript, dès le rendu serveur.
 */
function ThemedMark({ svg, slot, className, label }: MarkProps & { svg: ThemedSvg; slot: string }): React.JSX.Element {
  return (
    <span
      data-slot={slot}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("inline-block size-4 shrink-0 select-none", className)}
    >
      <img
        src={dataUri(svg.light)}
        alt=""
        width={16}
        height={16}
        draggable={false}
        data-mark-theme="light"
        className="block size-full"
      />
      <img
        src={dataUri(svg.dark)}
        alt=""
        width={16}
        height={16}
        draggable={false}
        data-mark-theme="dark"
        className="block size-full"
      />
    </span>
  )
}

/**
 * Icône d'un produit : le pictogramme clair seul, sans fond, le même dans tous les contextes.
 * Il remplit le cadre (`size-4` par défaut, à agrandir par `className`).
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
      data-slot="product-badge"
      className={cn("size-4 shrink-0 select-none", className)}
    />
  )
}

/** Le H « Double », marque de la H Collection (« Propulsé par », hub). `size-4` par défaut. */
export function FamilyMark({ className, label }: MarkProps): React.JSX.Element {
  return <ThemedMark svg={FAMILY_MARK_SVG} slot="family-mark" className={className} label={label} />
}
