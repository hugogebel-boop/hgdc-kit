import { useEffect, useSyncExternalStore } from "react"

import { shellBootScript } from "./shell-memory.ts"

const RAIL_KEY = "sidebar"
const RAIL_EVENT = "sidebarchange"

/**
 * À poser dans le `<head>`, avec `themeInitScript` : avant la première peinture, il remet le
 * rail (la variante CSS `rail:` le lit, rien ne saute au chargement) et la mémoire de la coque
 * partagée sous la même origine (`shell-memory` : produit de l'adresse, dernière organisation,
 * hauteur de la navigation), que le cadre du chargeur et `OrgPlaceholder` lisent (ADR 0020).
 */
export const sidebarInitScript: string = shellBootScript()

function subscribeRail(onChange: () => void): () => void {
  window.addEventListener(RAIL_EVENT, onChange)
  return () => window.removeEventListener(RAIL_EVENT, onChange)
}

/** La barre latérale est-elle réduite en rail ? L'état vit sur `<html data-sidebar="rail">`. */
export function useSidebarRail(): boolean {
  return useSyncExternalStore(
    subscribeRail,
    () => document.documentElement.dataset.sidebar === "rail",
    () => false,
  )
}

export function toggleSidebar(): void {
  const root = document.documentElement
  const rail = root.dataset.sidebar !== "rail"
  if (rail) root.dataset.sidebar = "rail"
  else delete root.dataset.sidebar
  try {
    if (rail) localStorage.setItem(RAIL_KEY, "rail")
    else localStorage.removeItem(RAIL_KEY)
  } catch {
    // Stockage bloqué : le choix vaut pour cette page seulement.
  }
  window.dispatchEvent(new Event(RAIL_EVENT))
}

/** `Ctrl+B` (`⌘B`) réduit ou déplie la barre latérale, hors des champs de saisie. */
export function useToggleShortcut(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const target = event.target
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable=true]")) return
      event.preventDefault()
      toggleSidebar()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
}
