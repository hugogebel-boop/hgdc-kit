import type { ReactNode } from "react"

import { Alert } from "./alert.tsx"
import { cn } from "./cn.ts"

/**
 * Bandeau permanent de la démo d'une console (organisation `~demo`, lue sans compte) : ce que le
 * visiteur regarde, et comment essayer pour de vrai. Posé en tête du contenu de la console, au-dessus
 * de chaque page. `signIn` : le bouton « Se connecter » du produit (un lien de son routeur, qui
 * repart par une page neuve pour ouvrir une vraie session).
 */
export function DemoNotice({
  signIn,
  children = "Une entreprise inventée, avec des données fictives. Tu peux tout regarder, rien n'est enregistré.",
  className,
}: {
  signIn: ReactNode
  /** Ce que montre la démo, en une phrase. */
  children?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <Alert data-demo-notice="" className={cn("mb-6", className)} title="Démo" action={signIn}>
      {children}
    </Alert>
  )
}
