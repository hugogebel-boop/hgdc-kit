import { createContext, useContext, type Context } from "react"

import type { FamilyProduct } from "./family-svg.ts"

export type ShellContextValue = { closeMobileNav: () => void; product?: FamilyProduct }

export const ShellContext: Context<ShellContextValue> = createContext<ShellContextValue>({
  closeMobileNav: () => {},
})

/** Pour fermer le tiroir mobile depuis un élément de la barre (un sélecteur, un bouton). */
export function useAppShell(): { closeMobileNav: () => void } {
  return useContext(ShellContext)
}
