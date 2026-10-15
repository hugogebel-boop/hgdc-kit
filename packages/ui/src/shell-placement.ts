import { createContext, useContext } from "react"

/**
 * Où `AppShell` pose un élément du produit (le sélecteur d'organisation) : dans la barre latérale
 * ou le tiroir mobile, ou en haut de la barre des produits, où il n'a qu'une colonne de 56 px.
 */
export type ShellPlacement = "sidebar" | "product-rail"

export const ShellPlacementContext: React.Context<ShellPlacement> = createContext<ShellPlacement>("sidebar")

export function useShellPlacement(): ShellPlacement {
  return useContext(ShellPlacementContext)
}
