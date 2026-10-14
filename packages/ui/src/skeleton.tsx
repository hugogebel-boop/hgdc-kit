import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "./cn.ts"

/**
 * Un bloc de chargement : il prend la forme exacte de ce qu'il remplace (hauteur d'une ligne,
 * largeur d'un titre), pour que rien ne saute à l'arrivée des données. `bg-foreground/6` plutôt
 * que `bg-muted` : posé sur une carte `surface`, qui est déjà `muted` en clair, il restait invisible.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn("skeleton-pulse rounded-xl bg-foreground/6", className)}
      {...props}
    />
  )
}

export type PendingTiming = {
  /** Attente avant d'afficher le squelette : une réponse rapide n'en montre aucun (ms). */
  delay?: number
  /** Durée minimale d'affichage d'un squelette apparu, pour qu'il ne clignote pas (ms). */
  minDuration?: number
}

/**
 * Faut-il montrer le squelette ? Il n'apparaît qu'après `delay` (200 ms) et, une fois là, reste
 * au moins `minDuration` (400 ms) : une donnée qui arrive en 250 ms ne fait pas clignoter
 * l'écran deux fois.
 */
export function usePendingVisibility(
  pending: boolean,
  { delay = 200, minDuration = 400 }: PendingTiming = {},
): boolean {
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)
  useEffect(() => {
    if (pending === visible) return
    const wait = pending ? delay : Math.max(0, shownAt.current + minDuration - Date.now())
    const timer = setTimeout(() => {
      if (pending) shownAt.current = Date.now()
      setVisible(pending)
    }, wait)
    return () => clearTimeout(timer)
  }, [pending, visible, delay, minDuration])
  return visible
}

/**
 * Le contenu, ou son squelette quand il se fait attendre. Pendant le délai, rien n'est rendu :
 * une page qui répond vite passe directement du vide au contenu.
 */
export function Pending({
  pending,
  fallback,
  children,
  delay,
  minDuration,
}: PendingTiming & {
  pending: boolean
  fallback: ReactNode
  children?: ReactNode
}): React.JSX.Element | null {
  const showFallback = usePendingVisibility(pending, {
    ...(delay !== undefined ? { delay } : {}),
    ...(minDuration !== undefined ? { minDuration } : {}),
  })
  if (showFallback)
    return (
      <div aria-busy="true" data-slot="pending">
        <span className="sr-only" role="status">
          Chargement
        </span>
        {fallback}
      </div>
    )
  if (pending) return null
  return <>{children}</>
}
