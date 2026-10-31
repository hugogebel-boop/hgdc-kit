import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { PAGE_PENDING_MIN_MS, PAGE_PENDING_MS } from "./page-pending.tsx"

export const useIsomorphicLayoutEffect: typeof useLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

/** Faux au rendu serveur et à l'hydratation, vrai avant la première image qui suit. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useIsomorphicLayoutEffect(() => setHydrated(true), [])
  return hydrated
}

/**
 * Le chargement de la zone de contenu : `navigating` après 50 ms, `pending` aussitôt, puis au
 * moins 300 ms. Effets de mise en page : une page qui passe en attente est couverte avant d'être
 * peinte, jamais une image vide entre les deux.
 */
export function useContentLoading({ navigating, pending }: { navigating: boolean; pending: boolean }): boolean {
  const [navigatingLong, setNavigatingLong] = useState(false)
  useEffect(() => {
    if (!navigating) return undefined
    const timer = window.setTimeout(() => setNavigatingLong(true), PAGE_PENDING_MS)
    return () => {
      window.clearTimeout(timer)
      setNavigatingLong(false)
    }
  }, [navigating])
  const active = pending || (navigating && navigatingLong)
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)
  useIsomorphicLayoutEffect(() => {
    if (active && !visible) {
      shownAt.current = performance.now()
      setVisible(true)
      return undefined
    }
    if (!active && visible) {
      const timer = window.setTimeout(
        () => setVisible(false),
        Math.max(0, shownAt.current + PAGE_PENDING_MIN_MS - performance.now()),
      )
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [active, visible])
  return visible
}
