import { useEffect, useLayoutEffect, useRef } from "react"

import { cn } from "./cn.ts"

const SIZES = { sm: 24, md: 40, lg: 64 } as const

/**
 * Le chargement d'une page : la silhouette grise du H de la famille, toujours visible, dont les
 * trois pièces se remplissent de leurs dégradés tricolores l'une après l'autre, puis se vident, en
 * boucle (1,6 s). CSS seul (`styles.css`) et seulement `transform` : l'animation tourne sur le
 * compositeur et reste fluide pendant qu'une page charge. Mouvement réduit : la silhouette reste,
 * le remplissage pulse doucement.
 *
 * Dans la coque (`AppShell`), un chargement de page passe par `PagePending`, qui affiche ce H à une
 * position fixe au centre de la zone de contenu. Ailleurs, `page` le centre dans l'écran. Dans un
 * bouton ou une ligne, `Spinner` reste la règle.
 */
export function FamilyLoader({
  size,
  label = "Chargement…",
  page = false,
  className,
}: {
  /** `sm` 24 px, `md` 40 px, `lg` 64 px. Par défaut `lg` en page, `md` sinon. */
  size?: keyof typeof SIZES
  label?: string
  /** Centré dans l'écran, pour un chargement hors de la coque. */
  page?: boolean
  className?: string
}): React.JSX.Element {
  const px = SIZES[size ?? (page ? "lg" : "md")]
  const ref = useRef<HTMLSpanElement>(null)
  // Tous les H de la page battent en phase, calés sur l'horloge du document : passer du calque de
  // navigation de la coque à celui de la page, ou du rendu serveur à l'hydratation, ne saute pas.
  useIsomorphicLayoutEffect(() => {
    for (const animation of ref.current?.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0
  }, [])
  const loader = (
    <span
      ref={ref}
      role="status"
      aria-label={label}
      data-slot="family-loader"
      className={cn("family-loader", !page && className)}
      style={{ ["--family-loader-size" as string]: `${px}px` }}
    >
      {(["left", "right", "bar"] as const).map((piece) => (
        <span key={piece} data-piece={piece} aria-hidden>
          <span data-fill />
        </span>
      ))}
    </span>
  )
  if (!page) return loader
  return (
    <div data-slot="family-loader-page" className={cn("grid min-h-dvh w-full place-items-center", className)}>
      {loader}
    </div>
  )
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect
