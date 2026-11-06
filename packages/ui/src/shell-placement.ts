import { createContext, useContext } from "react"

import type { ShellLink } from "./shell-links.tsx"

/**
 * Vrai quand la coque montre la barre de Basalte (Manager et modules) : le menu du compte ne répète
 * pas les produits et reprend les accès d'aide (`ShellMenuLinksContext`).
 */
export const ModuleBarShownContext: React.Context<boolean> = createContext<boolean>(false)

export function useModuleBarShown(): boolean {
  return useContext(ModuleBarShownContext)
}

/** Les accès que le menu du compte porte dans la barre de Basalte. */
export type ShellMenuLinks = {
  documentation?: ShellLink | undefined
  status?: ShellLink | undefined
  otherView?: { label: string; href: string; onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void } | undefined
}

export const ShellMenuLinksContext: React.Context<ShellMenuLinks> = createContext<ShellMenuLinks>({})

export function useShellMenuLinks(): ShellMenuLinks {
  return useContext(ShellMenuLinksContext)
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
