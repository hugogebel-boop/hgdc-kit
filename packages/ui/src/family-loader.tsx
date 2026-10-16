import { useId } from "react"

import { cn } from "./cn.ts"

const SIZES = { sm: "size-6", md: "size-10", lg: "size-16" } as const

/**
 * Le chargement d'une page : le H tricolore de la H family se construit, tient, s'efface, en
 * boucle (CSS seul, `styles.css`). La forme et les dégradés sont ceux de `FAMILY_MARK_SVG`.
 * Il n'apparaît qu'après 200 ms (`delay`) : une page rapide ne le montre jamais, et sa place est
 * réservée dès le départ, rien ne saute. Mouvement réduit : le H entier respire.
 *
 * Pour une page ou une route entière (`pendingComponent`, `Pending` de page) ; dans un bouton ou
 * une ligne, `Spinner` reste la règle. `page` le centre dans la hauteur visible.
 */
export function FamilyLoader({
  size = "md",
  label = "Chargement…",
  delay = 200,
  page = false,
  className,
}: {
  size?: keyof typeof SIZES
  label?: string
  /** Attente avant d'apparaître, en millisecondes. */
  delay?: number
  /** Centré dans un bloc de la hauteur de l'écran, pour un chargement de page. */
  page?: boolean
  className?: string
}): React.JSX.Element {
  // Ids des dégradés propres à chaque instance : deux loaders ne se volent pas leurs couleurs.
  const id = useId().replace(/[^\w-]/g, "")
  const loader = (
    <span
      role="status"
      aria-label={label}
      data-slot="family-loader"
      className={cn("family-loader inline-grid shrink-0 place-items-center", SIZES[size], !page && className)}
      style={{ ["--family-loader-delay" as string]: `${delay}ms` }}
    >
      <svg viewBox="0 0 256 256" aria-hidden className="size-full overflow-visible">
        <defs>
          <linearGradient id={`${id}l`} x1="0" y1="24" x2="0" y2="232" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2c78fd" />
            <stop offset="1" stopColor="#7343fe" />
          </linearGradient>
          <linearGradient id={`${id}r`} x1="0" y1="24" x2="0" y2="232" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fe5292" />
            <stop offset="1" stopColor="#ff9a46" />
          </linearGradient>
          <linearGradient id={`${id}b`} x1="64" y1="0" x2="192" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8145ff" />
            <stop offset="1" stopColor="#fe5292" />
          </linearGradient>
        </defs>
        <rect data-piece="left" x="43" y="24" width="57" height="208" rx="18" fill={`url(#${id}l)`} />
        <rect data-piece="right" x="156" y="24" width="57" height="208" rx="18" fill={`url(#${id}r)`} />
        <rect data-piece="bar" x="67" y="107" width="122" height="43" rx="14" fill={`url(#${id}b)`} />
      </svg>
    </span>
  )
  if (!page) return loader
  return (
    <div data-slot="family-loader-page" className={cn("grid min-h-[60dvh] w-full place-items-center", className)}>
      {loader}
    </div>
  )
}
