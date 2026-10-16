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

/**
 * Vrai quand la coque affiche la barre des produits (sur ordinateur) : les produits y sont déjà,
 * le menu du compte ne les répète pas au-delà de `lg`.
 */
export const ProductRailShownContext: React.Context<boolean> = createContext<boolean>(false)

export function useProductRailShown(): boolean {
  return useContext(ProductRailShownContext)
}
