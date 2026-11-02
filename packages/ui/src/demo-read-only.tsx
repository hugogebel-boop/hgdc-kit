import { cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"

/** Texte de l'infobulle d'un bouton d'écriture dans la démo. */
export const DEMO_READ_ONLY_HINT = "Lecture seule dans la démo"

const DemoReadOnlyContext = createContext(false)

/**
 * Posé une fois autour de la console, `value` vrai sur la démo (organisation `~demo`) : chaque
 * `DemoReadOnly` en dessous désactive son bouton. Le serveur refuse de toute façon (`refuseDemo`) ;
 * ceci évite au visiteur un clic qui échoue.
 */
export function DemoReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }): React.JSX.Element {
  return <DemoReadOnlyContext.Provider value={value}>{children}</DemoReadOnlyContext.Provider>
}

/** Vrai dans la démo : pour masquer ce qui n'a pas de sens en lecture seule (formulaire, zone de dépôt). */
export function useDemoReadOnly(): boolean {
  return useContext(DemoReadOnlyContext)
}

type Disableable = { disabled?: boolean; "aria-disabled"?: boolean | "true" | "false" }

/**
 * Autour d'un bouton d'écriture (créer, envoyer, supprimer…). Hors de la démo : le bouton tel quel.
 * Dans la démo : le bouton désactivé, et l'infobulle « Lecture seule dans la démo » sur une enveloppe
 * focalisable, puisqu'un bouton désactivé ne reçoit ni survol ni focus.
 */
export function DemoReadOnly({
  children,
  hint = DEMO_READ_ONLY_HINT,
}: {
  children: ReactElement<Disableable>
  hint?: string
}): React.JSX.Element {
  const demo = useDemoReadOnly()
  if (!demo || !isValidElement(children)) return children
  return (
    <Tooltip>
      <TooltipTrigger
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- un bouton désactivé ne prend pas le focus : l'enveloppe le prend pour que le clavier lise la raison.
        render={<span tabIndex={0} aria-label={hint} data-demo-read-only="" className="inline-flex w-fit" />}
      >
        {cloneElement(children, { disabled: true, "aria-disabled": true })}
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
