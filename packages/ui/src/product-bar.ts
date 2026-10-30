import { useEffect, useSyncExternalStore } from "react"

import type { ProductView } from "./addresses.ts"

/**
 * Réglage « Barre des produits » (ADR 0014 de la famille), choisi dans Account :
 * - `auto` : la barre sous `app.hgdc.ch`, pas sur `<mot>.hgdc.ch` ;
 * - `always` : toujours ;
 * - `never` : jamais.
 *
 * Account le garde ; chaque produit le relit (`ACCOUNT_PREFERENCES_URL`, CORS avec le cookie
 * d'Account, même site `hgdc.ch`) et retient la dernière valeur dans `localStorage` de son origine.
 * Account injoignable : dernière valeur connue, sinon `auto`.
 */
export type ProductBarPreference = "auto" | "always" | "never"

export const PRODUCT_BAR_PREFERENCES: ReadonlyArray<ProductBarPreference> = ["auto", "always", "never"]

/** Libellés du réglage, dans l'ordre d'affichage. */
export const PRODUCT_BAR_LABELS: Readonly<Record<ProductBarPreference, string>> = {
  auto: "Automatique (selon l'adresse)",
  always: "Toujours",
  never: "Jamais",
}

/** Lecture du réglage chez Account : `{ productBar }`, rien d'autre. */
export const ACCOUNT_PREFERENCES_URL = "https://account.hgdc.ch/api/preferences"

const STORAGE_KEY = "hgdc-product-bar"
const EVENT = "hgdc-product-bar"

/** Valeur reçue (Account, stockage) : un réglage connu, sinon `auto`. */
export function parseProductBar(value: unknown): ProductBarPreference {
  return (PRODUCT_BAR_PREFERENCES as ReadonlyArray<unknown>).includes(value) ? (value as ProductBarPreference) : "auto"
}

/** La barre des produits est-elle montrée dans cette vue, avec ce réglage ? */
export function productBarShown(view: ProductView, preference: ProductBarPreference): boolean {
  if (preference === "always") return true
  if (preference === "never") return false
  return view === "app"
}

function stored(): ProductBarPreference {
  try {
    return parseProductBar(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return "auto"
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

/** Retient le réglage dans cette origine et prévient la coque. */
export function rememberProductBar(preference: ProductBarPreference): void {
  try {
    if (preference === "auto") window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Stockage bloqué : la coque garde « automatique ».
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Le réglage retenu dans cette origine ; `auto` au rendu serveur. */
export function useProductBarPreference(): ProductBarPreference {
  return useSyncExternalStore(subscribe, stored, () => "auto")
}

/** Relit le réglage chez Account une fois par chargement de page ; une erreur garde la dernière valeur. */
export async function syncProductBar(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const response = await fetchImpl(ACCOUNT_PREFERENCES_URL, { credentials: "include", cache: "no-store" })
    if (!response.ok) return
    const body: unknown = await response.json()
    if (typeof body === "object" && body !== null && "productBar" in body)
      rememberProductBar(parseProductBar(body.productBar))
  } catch {
    // Account injoignable ou hors ligne : rien ne change.
  }
}

let synced = false

/** À monter une fois (la coque le fait) : relecture du réglage après l'hydratation. */
export function useProductBarSync(enabled = true): void {
  useEffect(() => {
    // Account n'accepte que les consoles de `hgdc.ch` : en local, en test, rien à demander.
    if (!enabled || synced || !window.location.hostname.endsWith(".hgdc.ch")) return
    synced = true
    void syncProductBar()
  }, [enabled])
}
