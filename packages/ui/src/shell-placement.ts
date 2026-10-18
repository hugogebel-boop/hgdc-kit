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

/**
 * Prévient la coque qu'un lien vers un autre produit (ou une autre adresse servie en document
 * complet) vient d'être suivi : elle couvre aussitôt la zone de contenu du H de chargement, le
 * temps que le navigateur ouvre l'autre produit. Sans coque, ne fait rien.
 */
export const ShellLeaveContext: React.Context<() => void> = createContext<() => void>(() => {})

/** `onClick` d'un lien vers un autre produit : clic simple seulement (pas Ctrl, Cmd, Maj, molette). */
export function useLeaveOnClick(): (event: React.MouseEvent<HTMLAnchorElement>) => void {
  const leave = useContext(ShellLeaveContext)
  return (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.currentTarget.getAttribute("target")
    if (target && target !== "_self") return
    leave()
  }
}

/**
 * Page de statut du produit affiché, posée par `AppShell` (son `statusPage`, sinon
 * `https://status.hgdc.ch/<produit>`) : le menu du compte en tire son entrée « État du service ».
 * `null` hors de la coque ou quand la coque ne lit aucune page.
 */
export const StatusPageContext: React.Context<string | null> = createContext<string | null>(null)

export function useStatusPage(): string | null {
  return useContext(StatusPageContext)
}
