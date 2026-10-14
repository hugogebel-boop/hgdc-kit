import { cn } from "./cn.ts"

const SIZES = { 3: "size-3", 4: "size-4", 5: "size-5", 6: "size-6", 8: "size-8" } as const

/**
 * L'anneau d'attente de la DA : un arc arrondi qui tourne sur une piste à peine visible, le
 * même que la page d'attente du portail. Dans un bouton ou une ligne, il prend la couleur du
 * texte (`tone="current"`) ; seul sur une page, il prend l'accent (`tone="accent"`).
 * Mouvement réduit : l'arc ne tourne plus, il respire.
 */
export function Spinner({
  className,
  label,
  size = 4,
  tone = "current",
}: {
  className?: string
  label?: string
  size?: keyof typeof SIZES
  tone?: "current" | "accent"
}): React.JSX.Element {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("shrink-0", SIZES[size])}>
        <circle cx="16" cy="16" r="13" strokeWidth="4" className="stroke-current opacity-15" />
        <circle
          cx="16"
          cy="16"
          r="13"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="22 60"
          className={cn(
            "origin-center animate-spin motion-reduce:animate-pulse",
            tone === "accent" ? "stroke-accent" : "stroke-current",
          )}
        />
      </svg>
      {label ? <span>{label}</span> : <span className="sr-only">Chargement</span>}
    </span>
  )
}
