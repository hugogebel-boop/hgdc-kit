import { type AuthClient, ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import type { ComponentProps, ReactElement } from "react"

/**
 * Ce que `ConvexBetterAuthProvider` appelle sur le client better-auth (plugin `convexClient()` compris).
 * Le plugin `crossDomainClient` (lu quand l'adresse porte `?ott=`) n'est pas couvert : aucun produit ne
 * l'utilise.
 */
export type HgdcProviderAuthClient = {
  useSession: () => { data: { session: { id: string } } | null; isPending: boolean }
  getSession: (options?: { fetchOptions?: { headers?: Record<string, string> } }) => Promise<unknown>
  convex: { token: (options: { fetchOptions: { throw: false } }) => Promise<{ data: { token: string } | null }> }
}

/**
 * Options du client Convex de chaque console, à étaler dans `new ConvexQueryClient(url, { ...HGDC_CONVEX_CLIENT_OPTIONS, expectAuth })`.
 *
 * `initialAuthTokenReuse` : le jeton du rendu serveur (`initialToken`) est gardé jusqu'à peu avant son
 * expiration. Sans lui, Convex redemande un jeton aussitôt le premier validé (`/convex/token` deux fois
 * par page) et réexécute toutes les requêtes authentifiées (2026-11-11). Option marquée expérimentale
 * par Convex 1.46 : un jeton refusé déclenche toujours une nouvelle demande.
 */
export const HGDC_CONVEX_CLIENT_OPTIONS: { readonly initialAuthTokenReuse: true } = { initialAuthTokenReuse: true }

export type HgdcConvexAuthProviderProps = Omit<ComponentProps<typeof ConvexBetterAuthProvider>, "authClient"> & {
  /** Le client de `createAuthClient` de better-auth, avec `convexClient()` dans ses plugins. */
  authClient: HgdcProviderAuthClient
}

/**
 * `ConvexBetterAuthProvider` de `@convex-dev/better-auth` pour un client better-auth 1.6.18 ou
 * plus. Ces versions typent `useSession().data` d'une façon que le type `AuthClient` de l'adaptateur
 * 0.12 ne suit pas (il en déduit `never`) : le client passé tel quel ne compile plus, alors que l'objet
 * est le même à l'exécution. La conversion vit ici, une seule fois pour toute la famille, au lieu d'un
 * cast dans chaque produit. À retirer quand l'adaptateur suit better-auth.
 */
export function HgdcConvexAuthProvider({ authClient, ...props }: HgdcConvexAuthProviderProps): ReactElement {
  return <ConvexBetterAuthProvider {...props} authClient={authClient as unknown as AuthClient} />
}
