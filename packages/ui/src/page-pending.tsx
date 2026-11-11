import { createContext, useContext, useEffect, useState } from "react"

import { FamilyLoaderRootContext, PageLoadingPlaceholder } from "./family-loader.tsx"
import { PageSkeleton, type PageSkeletonVariant } from "./page-skeleton.tsx"

/**
 * Attente avant de remplacer l'ancienne page par le squelette de la nouvelle (ADR 0025). En dessous,
 * l'ancienne page reste à l'écran avec la barre de progression : une navigation courte ne fait rien
 * clignoter. Valeur par défaut de TanStack Router, et seuil d'une seconde de Nielsen.
 */
export const PAGE_PENDING_MS = 1000

/** Durée minimale d'affichage du squelette une fois apparu : il ne clignote pas (défaut de TanStack Router). */
export const PAGE_PENDING_MIN_MS = 500

/** Attente avant la barre de progression d'une navigation : une page préchargée s'ouvre sans elle. */
export const NAVIGATION_PROGRESS_MS = 150

/** Durée minimale de la barre de progression une fois apparue. */
export const NAVIGATION_PROGRESS_MIN_MS = 300

/**
 * Calque de la zone de contenu, sous l'en-tête de la coque (56 px), opaque : il cache la page
 * pendant le départ vers un autre module, le H du document par-dessus (ADR 0015, 0020).
 */
export const CONTENT_LOADING_LAYER = "absolute inset-x-0 top-14 bottom-0 z-20 bg-background"

/** Vrai dans la zone de contenu d'`AppShell` : une page qui attend y montre son squelette, pas le H. */
export const ShellContentContext: React.Context<boolean> = createContext<boolean>(false)

/**
 * Le chargement d'une page.
 *
 * - **Dans la coque** (`AppShell`) : le squelette de la page (`PageSkeleton`), la coque restant en
 *   place. Jamais le H : il est réservé au document qui n'a pas encore de coque (ADR 0025).
 * - **Hors de la coque** (page d'entrée, rendu serveur sans coque) : le H du document
 *   (`FamilyLoaderRoot`), au même pixel que dans la coque (ADR 0015).
 *
 * Composant par défaut de `pendingComponent` (`routerPendingDefaults`) et repli de la frontière
 * `Suspense` de la coque. Une route dont la page n'est pas une liste passe sa forme :
 * `pendingComponent: () => <PagePending variant="dashboard" />`.
 */
export function PagePending({
  label = "Chargement…",
  variant,
}: {
  label?: string
  variant?: PageSkeletonVariant
}): React.JSX.Element {
  const inShell = useContext(ShellContentContext)
  const hasRoot = useContext(FamilyLoaderRootContext)
  if (inShell) return <PageSkeleton label={label} {...(variant ? { variant } : {})} />
  return <PageLoadingPlaceholder label={label} hasRoot={hasRoot} />
}

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
 * Réglages communs de `createRouter` (TanStack Router), ADR 0025 :
 * - préchargement au survol ou au focus d'un lien (`intent`) : la plupart des pages s'ouvrent sans
 *   attente ; `defaultPreloadStaleTime: 0` laisse TanStack Query décider de la fraîcheur (doc de
 *   TanStack Router, « External data loading ») ;
 * - pendant une navigation, l'ancienne page reste avec la barre de progression de la coque ; si la
 *   nouvelle attend encore ses données après 1 s, son squelette (`PagePending`) la remplace, au
 *   moins 500 ms.
 *
 * ```ts
 * createRouter({ routeTree, ...routerPendingDefaults })
 * ```
 *
 * La coque doit vivre dans une route de mise en page (`/o/$org`), rendue avant les données des
 * pages, et le `beforeLoad` de la racine ne doit pas appeler le serveur à chaque navigation.
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
