import { cn } from "./cn.ts"

/**
 * Où couper : la fin gardée entière. Un chemin garde son dernier segment (`…/src/app.tsx`), un
 * identifiant ses `tail` derniers caractères (`dpl_8f3a…c91e`). La fin d'un identifiant est celle
 * qu'on compare d'un coup d'œil, comme dans un hash git.
 */
export function splitForTruncation(text: string, tail = 8): [start: string, end: string] {
  if (text.length <= tail * 2) return [text, ""]
  const slash = text.lastIndexOf("/", text.length - 2)
  const segment = slash > 0 ? text.length - slash : 0
  // Un dernier segment trop long ou trop court ne sert pas de fin : on revient aux caractères.
  const keep = segment > 2 && segment <= tail * 3 ? segment : tail
  return [text.slice(0, text.length - keep), text.slice(text.length - keep)]
}

/**
 * Un texte long coupé au milieu quand la place manque : le début s'efface en « … », la fin reste
 * lisible. Le texte entier reste dans la page (lecteurs d'écran, sélection, copie, recherche du
 * navigateur) et dans l'infobulle native. Pur CSS : aucune mesure, la coupe suit la largeur.
 */
export function MiddleTruncate({
  text,
  tail = 8,
  className,
}: {
  text: string
  /** Caractères gardés à la fin quand le texte n'est pas un chemin. */
  tail?: number
  className?: string
}): React.JSX.Element {
  const [start, end] = splitForTruncation(text, tail)
  return (
    <span data-slot="middle-truncate" title={text} className={cn("inline-flex max-w-full min-w-0", className)}>
      <span className="min-w-0 truncate">{start}</span>
      {end ? <span className="shrink-0 whitespace-pre">{end}</span> : null}
    </span>
  )
}
