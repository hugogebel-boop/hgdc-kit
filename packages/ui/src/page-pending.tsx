import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react"

import { FamilyLoader } from "./family-loader.tsx"

/**
 * Délai avant de couvrir l'ancienne page pendant une navigation : une navigation préchargée
 * (survol, `defaultPreload: "intent"`) se termine avant et ne montre rien.
 */
export const PAGE_PENDING_MS = 50

/** Durée minimale d'affichage une fois apparu : le H ne clignote pas. */
export const PAGE_PENDING_MIN_MS = 300

/**
 * Calque de chargement de la zone de contenu : sous l'en-tête de la coque (56 px), sur toute la
 * largeur, opaque. Le H y est centré dans la hauteur visible et y reste (`sticky`) : même place
 * pour le calque de navigation de la coque et pour `PagePending`, donc aucun saut de l'un à l'autre.
 */
export const CONTENT_LOADING_LAYER = "absolute inset-x-0 top-14 bottom-0 z-20 bg-background"
const CONTENT_LOADING_STAGE =
  "sticky top-14 grid h-[calc(100dvh-3.5rem)] place-items-center lg:h-[calc(100dvh-1rem-3.5rem)]"

/** Le H centré dans la zone de contenu (calque de `CONTENT_LOADING_LAYER`). */
export function ContentLoadingStage({ label }: { label: string }): React.JSX.Element {
  return (
    <div className={CONTENT_LOADING_STAGE}>
      <FamilyLoader size="lg" label={label} />
    </div>
  )
}

/**
 * Fourni par `AppShell` autour de la zone de contenu : `PagePending` s'y signale, pour que la coque
 * n'affiche pas son propre calque de navigation par-dessus.
 */
export const ContentLoadingContext: React.Context<(() => () => void) | null> = createContext<(() => () => void) | null>(
  null,
)

/**
 * Le chargement d'une page. Dans la coque (`AppShell`) : le H centré sur un calque opaque de la
 * zone de contenu, la coque restant en place, dès le rendu serveur. Hors de la coque : le H centré
 * dans l'écran. Composant de `pendingComponent` (TanStack Router, `routerPendingDefaults`), repli
 * de la frontière `Suspense` de la coque, et état de chargement d'une page qui lit ses données.
 */
export function PagePending({ label = "Chargement…" }: { label?: string }): React.JSX.Element {
  const register = useContext(ContentLoadingContext)
  useIsomorphicLayoutEffect(() => register?.(), [register])
  if (!register) return <FamilyLoader page label={label} />
  return (
    // La place de la page est gardée : le pied de page ne remonte pas sous le calque.
    <div data-slot="page-pending" className="min-h-[calc(100dvh-10rem)]">
      <div className={CONTENT_LOADING_LAYER}>
        <ContentLoadingStage label={label} />
      </div>
    </div>
  )
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * Vrai après `delay` ms de `active`, et le reste au moins `min` ms une fois vrai : un état bref ne
 * montre rien, un état montré ne clignote pas.
 */
export function useDelayedFlag(active: boolean, delay: number, min: number): boolean {
  const [visible, setVisible] = useState(false)
  const [shownAt, setShownAt] = useState(0)
  useEffect(() => {
    if (active && !visible) {
      const timer = window.setTimeout(() => {
        setShownAt(Date.now())
        setVisible(true)
      }, delay)
      return () => window.clearTimeout(timer)
    }
    if (!active && visible) {
      const timer = window.setTimeout(() => setVisible(false), Math.max(0, shownAt + min - Date.now()))
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [active, visible, delay, min, shownAt])
  return visible
}

/**
 * Réglages communs de `createRouter` (TanStack Router) :
 * - préchargement au survol ou au focus d'un lien (`intent`) : la plupart des pages s'ouvrent sans
 *   attente ; `defaultPreloadStaleTime: 0` laisse TanStack Query décider de la fraîcheur ;
 * - une route qui attend encore ses données montre `PagePending` après 50 ms, au moins 300 ms.
 *
 * ```ts
 * createRouter({ routeTree, ...routerPendingDefaults })
 * ```
 *
 * La coque doit vivre dans une route de mise en page (`/o/$org`) et le `beforeLoad` de la racine
 * ne doit pas appeler le serveur à chaque navigation : une attente là remplacerait toute l'app.
 */
export const routerPendingDefaults: {
  defaultPendingComponent: typeof PagePending
  defaultPendingMs: number
  defaultPendingMinMs: number
  defaultPreload: "intent"
  defaultPreloadStaleTime: number
} = {
  defaultPendingComponent: PagePending,
  defaultPendingMs: PAGE_PENDING_MS,
  defaultPendingMinMs: PAGE_PENDING_MIN_MS,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
}
