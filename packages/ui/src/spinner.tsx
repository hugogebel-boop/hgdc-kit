import { useId } from "react"

import { cn } from "./cn.ts"

const SIZES = { 3: "size-3", 4: "size-4", 5: "size-5", 6: "size-6", 8: "size-8" } as const

/**
 * L'anneau d'attente de la DA : un arc arrondi sur une piste à peine visible. La tête avance
 * toujours, la queue la rattrape, puis l'arc repart d'un point ; l'anneau tourne lentement en même
 * temps (`styles.css`, `.spinner-*`). Dans un bouton ou une ligne, il prend la couleur du texte
 * (`tone="current"`) ; seul sur une page, les couleurs du H (`tone="accent"`).
 * Mouvement réduit : un arc fixe qui respire.
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
  const gradient = useId()
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("shrink-0", SIZES[size])}>
        {tone === "accent" ? (
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2c78fd" />
              <stop offset="0.45" stopColor="#7343fe" />
              <stop offset="0.8" stopColor="#fe5292" />
              <stop offset="1" stopColor="#ff9a46" />
            </linearGradient>
          </defs>
        ) : null}
        <circle cx="16" cy="16" r="12" strokeWidth="4" className="stroke-current opacity-15" />
        <g className="spinner-rotor">
          <circle
            cx="16"
            cy="16"
            r="12"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            transform="rotate(-90 16 16)"
            className={cn("spinner-arc", tone === "accent" ? null : "stroke-current")}
            {...(tone === "accent" ? { stroke: `url(#${gradient})` } : {})}
          />
        </g>
      </svg>
      {label ? <span>{label}</span> : <span className="sr-only">Chargement</span>}
    </span>
  )
}
