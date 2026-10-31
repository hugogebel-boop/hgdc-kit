import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Délai entre le clic vers un autre produit et le H : une page prérendue s'affiche avant (une ou
 * deux images), le H n'apparaît alors jamais ; une page à charger le montre aussitôt après.
 */
export const PRODUCT_LEAVE_DELAY_MS = 100

export function useProductLeave(): { leaving: boolean; leave: () => void } {
  const [leaving, setLeaving] = useState(false)
  // Après `PRODUCT_LEAVE_DELAY_MS` seulement : une page prérendue au survol s'affiche avant, sans
  // que le H apparaisse (ADR 0020). Sinon le H couvre le contenu jusqu'au départ de la page.
  const leaveTimer = useRef<number | undefined>(undefined)
  const leave = useCallback(() => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setLeaving(true), PRODUCT_LEAVE_DELAY_MS)
  }, [])
  useEffect(() => {
    // Retour arrière depuis l'autre produit (cache de page) : la page revient telle quelle.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      window.clearTimeout(leaveTimer.current)
      setLeaving(false)
      delete document.documentElement.dataset.hgdcSwitching
    }
    window.addEventListener("pageshow", onPageShow)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.clearTimeout(leaveTimer.current)
    }
  }, [])
  return { leaving, leave }
}
