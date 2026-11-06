import { useSyncExternalStore } from "react"

import { DEFAULT_MODULE_BAR, parseModuleBar, type ModuleWord } from "./modules.ts"

/**
 * L'ordre et le choix des modules de la barre, propres à chaque personne. Sous `app.hgdc.ch`, toutes
 * les consoles partagent la même origine, donc le même réglage.
 */
export const MODULE_BAR_KEY = "hgdc-shell:modules"
const EVENT = "hgdc-module-bar"

let cachedRaw: string | null | undefined
let cachedOrder: ReadonlyArray<ModuleWord> = DEFAULT_MODULE_BAR

/** Même référence tant que le stockage ne change pas : `useSyncExternalStore` compare par identité. */
function read(): ReadonlyArray<ModuleWord> {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(MODULE_BAR_KEY)
  } catch {
    return DEFAULT_MODULE_BAR
  }
  if (raw === cachedRaw) return cachedOrder
  cachedRaw = raw
  cachedOrder = decode(raw)
  return cachedOrder
}

function decode(raw: string | null): ReadonlyArray<ModuleWord> {
  if (raw === null) return DEFAULT_MODULE_BAR
  try {
    return parseModuleBar(JSON.parse(raw)) ?? DEFAULT_MODULE_BAR
  } catch {
    return DEFAULT_MODULE_BAR
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function saveModuleBar(order: ReadonlyArray<ModuleWord>): void {
  try {
    window.localStorage.setItem(MODULE_BAR_KEY, JSON.stringify(order))
  } catch {
    // Stockage bloqué : la barre reprend l'ordre par défaut au prochain chargement.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** L'ordre retenu ; celui par défaut au rendu serveur. */
export function useModuleBar(): ReadonlyArray<ModuleWord> {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_MODULE_BAR)
}
