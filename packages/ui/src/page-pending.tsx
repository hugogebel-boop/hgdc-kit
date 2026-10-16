import { FamilyLoader } from "./family-loader.tsx"

/** Attente avant d'afficher le chargement d'une page : une navigation rapide ne le montre jamais. */
export const PAGE_PENDING_MS = 120

/** Durée minimale d'affichage une fois apparu : il ne clignote pas. */
export const PAGE_PENDING_MIN_MS = 400

/**
 * Le chargement d'une page dans la zone de contenu : le H de la famille, centré sous l'en-tête,
 * la coque restant en place. Composant de `pendingComponent` (TanStack Router) et repli de la
 * frontière `Suspense` de la coque (`AppShell`, `contentKey`). Sans délai propre : celui de la
 * route (`PAGE_PENDING_MS`) suffit.
 */
export function PagePending({ label = "Chargement…" }: { label?: string }): React.JSX.Element {
  return <FamilyLoader page delay={0} label={label} />
}

/**
 * Réglages communs de `createRouter` (TanStack Router) : dès qu'une navigation attend ses données
 * plus de 120 ms, la zone de contenu montre `PagePending` au lieu de garder l'ancienne page figée,
 * au moins 400 ms. Le défaut de TanStack Router attend 1 s.
 *
 * ```ts
 * createRouter({ routeTree, ...routerPendingDefaults })
 * ```
 */
export const routerPendingDefaults: {
  defaultPendingComponent: typeof PagePending
  defaultPendingMs: number
  defaultPendingMinMs: number
} = {
  defaultPendingComponent: PagePending,
  defaultPendingMs: PAGE_PENDING_MS,
  defaultPendingMinMs: PAGE_PENDING_MIN_MS,
}
