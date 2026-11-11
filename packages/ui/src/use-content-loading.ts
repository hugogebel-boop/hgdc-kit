import { useEffect, useLayoutEffect, useRef, useState } from "react"

/** Durée minimale du calque de départ une fois montré : le H ne clignote pas. */
const COVER_MIN_MS = 300

export const useIsomorphicLayoutEffect: typeof useLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

/** Faux au rendu serveur et à l'hydratation, vrai avant la première image qui suit. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useIsomorphicLayoutEffect(() => setHydrated(true), [])
  return hydrated
}

/**
 * Le calque du H sur la zone de contenu, pendant le départ vers un autre module : aussitôt, puis
 * au moins 300 ms. Effet de mise en page : la page est couverte avant d'être peinte, jamais une
 * image vide entre les deux. Une navigation dans le module ne le montre plus (ADR 0025).
 */
export function useShellCover(active: boolean): boolean {
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
        Math.max(0, shownAt.current + COVER_MIN_MS - performance.now()),
      )
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [active, visible])
  return visible
}
