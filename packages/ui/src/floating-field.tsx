"use client"

import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, type ReactNode } from "react"

import { cn } from "./cn.ts"

/**
 * Champ à libellé flottant, pour les écrans de connexion : le libellé est dans le champ vide et
 * monte sur le filet dès que le champ a le focus ou une valeur (saisie, autoremplissage).
 *
 * Tout en CSS : `placeholder=" "` rend `:placeholder-shown` vrai tant que le champ est vide, le
 * libellé (`peer-…`) suit sans JavaScript, dès le rendu serveur ; `:autofill` le monte aussi quand le
 * navigateur propose une valeur sans l'écrire encore (aperçu de l'autoremplissage, Chrome). Le libellé posé sur le filet
 * reprend le fond de la surface où le champ est posé (`surface`, fond de page par défaut). Texte à
 * 16 px : sous 16 px, Safari zoome au focus.
 *
 * L'erreur et la description sont citées par `aria-describedby` ; l'erreur garde une icône, pour ne
 * pas reposer sur la seule couleur (WCAG 1.4.1).
 */
function FloatingField({
  label,
  error,
  description,
  surface = "background",
  className,
  id,
  ...props
}: Omit<React.ComponentProps<"input">, "placeholder"> & {
  /** Libellé visible, aussi nom accessible du champ. */
  label: string
  /** Message d'erreur sous le champ ; le champ passe en `aria-invalid`. */
  error?: ReactNode
  /** Aide sous le champ, quand il n'y a pas d'erreur. */
  description?: ReactNode
  /** Fond sous le champ : le libellé posé sur le filet le reprend. */
  surface?: "background" | "card"
}): React.JSX.Element {
  const generated = useId()
  const inputId = id ?? generated
  const errorId = `${inputId}-error`
  const descriptionId = `${inputId}-description`
  const describedBy = [error ? errorId : null, !error && description ? descriptionId : null, props["aria-describedby"]]
    .filter(Boolean)
    .join(" ")

  return (
    <div data-slot="floating-field" className={cn("grid gap-1.5", className)}>
      <div className="relative">
        <input
          {...props}
          id={inputId}
          placeholder=" "
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={describedBy || undefined}
          className="peer touch-field h-14 w-full min-w-0 rounded-2xl bg-transparent px-4 text-base text-foreground ring-1 ring-control-off transition-[box-shadow] duration-(--duration-fast) outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive"
        />
        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute top-1/2 left-3 max-w-[calc(100%-1.5rem)] -translate-y-1/2 truncate px-1 text-base text-muted-foreground transition-[top,font-size,color] duration-(--duration-fast) ease-(--ease-out) peer-focus-visible:top-0 peer-focus-visible:text-xs peer-focus-visible:text-accent peer-aria-invalid:text-destructive peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs peer-autofill:top-0 peer-autofill:text-xs motion-reduce:transition-none",
            surface === "card" ? "bg-card" : "bg-background",
          )}
        >
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} data-slot="floating-field-error" className="flex gap-2 text-sm text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : description ? (
        <p id={descriptionId} data-slot="floating-field-description" className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

export { FloatingField }
