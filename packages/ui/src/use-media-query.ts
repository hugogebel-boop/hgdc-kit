/**
 * Lecture d'une media query, sûre au rendu serveur.
 *
 * `useSyncExternalStore` rend un `false` stable au serveur (pas de
 * clignotement), puis s'abonne à `matchMedia` une fois hydraté.
 *
 * Un couple `subscribe`/`getSnapshot` par requête, mémorisé au niveau du
 * module. React compare l'IDENTITÉ de `subscribe` : une fonction fabriquée
 * pendant le rendu fait retirer puis reposer l'écouteur `matchMedia` après
 * CHAQUE rendu. Sur le board « Suivi », trente cartes qui se rendent à chaque
 * image d'un glisser, cela faisait des milliers de poses et de retraits
 * d'écouteurs par seconde pour un booléen qui ne bouge pas.
 *
 * `window.matchMedia` est en revanche rappelé à chaque lecture, et non gardé :
 * un test qui remplace la fonction doit voir sa valeur prise en compte.
 *
 * @see https://react.dev/reference/react/useSyncExternalStore — « If you pass a
 * different subscribe function between re-renders, React will re-subscribe to
 * the store. »
 */

import { useSyncExternalStore } from "react"

type Store = {
  subscribe: (callback: () => void) => () => void
  getSnapshot: () => boolean
}

const stores = new Map<string, Store>()

function storeFor(query: string): Store {
  const cached = stores.get(query)
  if (cached) return cached

  const store: Store = {
    subscribe: (callback) => {
      if (typeof window === "undefined") return noop
      const list = window.matchMedia(query)
      list.addEventListener("change", callback)
      return () => list.removeEventListener("change", callback)
    },
    getSnapshot: () => typeof window !== "undefined" && window.matchMedia(query).matches,
  }
  stores.set(query, store)
  return store
}

function noop(): void {}

function serverSnapshot(): boolean {
  return false
}

export function useMediaQuery(query: string): boolean {
  const store = storeFor(query)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot)
}

/** Mobile = viewport < 1024px (matches lg: Tailwind breakpoint). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 1023px)")
}
