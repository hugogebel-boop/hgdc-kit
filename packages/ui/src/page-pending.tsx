import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react"

import { FamilyLoaderRootContext, PageLoadingPlaceholder } from "./family-loader.tsx"

/**
 * Délai avant de couvrir l'ancienne page pendant une navigation : une navigation préchargée
 * (survol, `defaultPreload: "intent"`) se termine avant et ne montre rien.
 */
export const PAGE_PENDING_MS = 50

/** Durée minimale d'affichage une fois apparu : le H ne clignote pas. */
export const PAGE_PENDING_MIN_MS = 300

/**
 * Calque de chargement de la zone de contenu : sous l'en-tête de la coque (56 px), sur toute la
 * largeur, opaque. Il cache l'ancienne page ; le H, lui, est celui du document
 * (`FamilyLoaderRoot`), en position fixe, au même pixel dans tous les états.
 */
export const CONTENT_LOADING_LAYER = "absolute inset-x-0 top-14 bottom-0 z-20 bg-background"

/**
 * @deprecated Le H d'un chargement de page est celui du document (`FamilyLoaderRoot`, ADR 0015) :
 * la scène ne garde qu'un texte pour les lecteurs d'écran.
 */
export function ContentLoadingStage({ label }: { label: string }): React.JSX.Element {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  )
}

/**
 * Fourni par `AppShell` autour de la zone de contenu : `PagePending` s'y signale, la coque couvre
 * alors la zone de contenu et montre le H du document.
 */
export const ContentLoadingContext: React.Context<(() => () => void) | null> = createContext<(() => () => void) | null>(
  null,
)

/**
 * Le chargement d'une page : le H de la famille, au centre de la zone de contenu de la coque, au
 * même pixel et à la même phase dans tous les états (calque de navigation de la coque, attente
 * d'une route, frontière `Suspense`, rendu serveur, page d'entrée, produit d'à côté). Ce composant
 * ne dessine pas de H : il marque la place de la page (`data-slot="page-pending"`) et le H du
 * document (`FamilyLoaderRoot`) s'affiche, dès le HTML du serveur. Dans la coque, la coque s'en
 * charge ; hors de la coque, le cadre de la coque est dessiné autour du H.
 *
 * Composant de `pendingComponent` (TanStack Router, `routerPendingDefaults`), repli de la frontière
 * `Suspense` de la coque, et état de chargement d'une page qui lit ses données.
 */
export function PagePending({ label = "Chargement…" }: { label?: string }): React.JSX.Element {
  const register = useContext(ContentLoadingContext)
  const hasRoot = useContext(FamilyLoaderRootContext)
  useIsomorphicLayoutEffect(() => register?.(), [register])
  if (!register) return <PageLoadingPlaceholder label={label} hasRoot={hasRoot} />
  return (
    // La place de la page est gardée : le pied de page ne remonte pas sous le calque.
    <div data-slot="page-pending" role="status" aria-label={label} className="min-h-[calc(100dvh-10rem)]" />
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

/** Ce que `shellNavigation` lit dans l'état de TanStack Router (`useRouterState`). */
export type RouterNavigationState = {
  status: string
  isLoading: boolean
  location: { pathname: string }
  resolvedLocation?: { pathname: string } | undefined
}

/**
 * Props de chargement d'`AppShell` tirées de l'état du routeur :
 *
 * ```tsx
 * const navigation = useRouterState({ select: shellNavigation, structuralSharing: true })
 * <AppShell {...navigation} … />
 * ```
 *
 * `navigating` : une autre page est demandée et pas encore affichée (pas une simple mise à jour
 * des paramètres de la page ouverte). `contentKey` : la page affichée, pas celle qui charge, pour
 * que l'ancienne page ne se remonte pas avant d'être remplacée.
 */
export function shellNavigation(state: RouterNavigationState): { navigating: boolean; contentKey: string } {
  const shown = state.resolvedLocation?.pathname ?? state.location.pathname
  return {
    navigating: (state.isLoading || state.status === "pending") && state.location.pathname !== shown,
    contentKey: shown,
  }
}
