import { useId, useState } from "react"

import { cn } from "./cn.ts"
import { useFieldDescribedBy, useFieldId } from "./field.tsx"
import { Input } from "./input.tsx"
import { StatusBadge, type StatusTone } from "./status.tsx"

/** `#7c3aed`, `7C3AED` ou `#abc` en `#7c3aed`, ou `null` si ce n'est pas une couleur hexadécimale. */
export function normalizeHexColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(hex))
    return `#${hex
      .split("")
      .map((c) => c + c)
      .join("")}`
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rapport de contraste WCAG 2 entre deux couleurs hexadécimales (1 à 21), ou `null` si l'une est invalide. */
export function contrastRatio(a: string, b: string): number | null {
  const x = normalizeHexColor(a)
  const y = normalizeHexColor(b)
  if (!x || !y) return null
  const [light, dark] = [luminance(x), luminance(y)].sort((m, n) => n - m) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Verdict d'un contraste pour du texte : 4,5:1 pour le texte courant, 3:1 pour le gros texte et les icônes (WCAG AA). */
export function contrastVerdict(ratio: number): { tone: StatusTone; label: string } {
  if (ratio >= 4.5) return { tone: "success", label: "Lisible" }
  if (ratio >= 3) return { tone: "warning", label: "Gros texte seulement" }
  return { tone: "danger", label: "Illisible" }
}

const ratioFormat = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * Une couleur de marque : la pastille ouvre le sélecteur du navigateur, le champ accepte un code
 * hexadécimal collé (`#7c3aed`). Sous le champ, le contraste avec `contrastWith` (le texte posé
 * sur cette couleur, blanc par défaut) et son verdict : un bouton à l'accent d'un client doit
 * rester lisible.
 *
 * La valeur rendue est toujours normalisée (`#rrggbb`) ; une saisie invalide n'appelle pas `onChange`
 * et reprend la dernière couleur valable en quittant le champ.
 */
export function ColorField({
  value,
  onChange,
  contrastWith = "#ffffff",
  contrastLabel = "le texte blanc",
  className,
  "aria-label": ariaLabel,
  id: idProp,
  disabled,
}: {
  /** `#rrggbb`. */
  value: string
  onChange: (value: string) => void
  /** Couleur comparée ; `null` retire le contrôle de contraste. */
  contrastWith?: string | null
  /** Ce qu'est cette couleur comparée, dans la phrase : « Contraste avec le texte blanc ». */
  contrastLabel?: string
  className?: string
  "aria-label"?: string
  id?: string
  disabled?: boolean
}): React.JSX.Element {
  const fieldId = useFieldId()
  const fieldDescribedBy = useFieldDescribedBy()
  const ownId = useId()
  const id = idProp ?? fieldId ?? ownId
  const [text, setText] = useState(value)
  // Une valeur changée par le produit (réinitialisation) remplace la saisie en cours.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(value)
  }

  const ratio = contrastWith ? contrastRatio(value, contrastWith) : null
  const verdict = ratio !== null ? contrastVerdict(ratio) : null
  const contrastId = `${id}-contrast`
  const describedBy = [fieldDescribedBy, ratio !== null ? contrastId : null].filter(Boolean).join(" ") || undefined

  // Pendant la frappe, seul un code complet (6 chiffres) est transmis : « #7c3 » deviendrait
  // « #77cc33 » sous les doigts. La forme courte se développe en quittant le champ.
  const commit = (next: string, complete = /^#?[0-9a-f]{6}$/i.test(next.trim())) => {
    setText(next)
    const normalized = complete ? normalizeHexColor(next) : null
    if (normalized && normalized !== value) onChange(normalized)
  }

  return (
    <div data-slot="color-field" className={cn("grid gap-2", className)}>
      <div className="flex items-center gap-2">
        <label
          className={cn(
            "relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl ring-1 ring-border/70 ring-inset focus-within:ring-2 focus-within:ring-ring lg:size-10",
            disabled && "pointer-events-none opacity-50",
          )}
          style={{ background: value }}
        >
          <span className="sr-only">Choisir dans le sélecteur de couleur</span>
          <input
            type="color"
            value={normalizeHexColor(value) ?? "#000000"}
            disabled={disabled}
            onChange={(event) => commit(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          id={id}
          value={text}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          maxLength={7}
          placeholder="#7c3aed"
          {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
          aria-describedby={describedBy}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => {
            const normalized = normalizeHexColor(text)
            if (normalized) commit(normalized, true)
            else setText(value)
          }}
          className="max-w-36 font-mono uppercase"
        />
      </div>
      {ratio !== null && verdict ? (
        <p id={contrastId} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Contraste avec {contrastLabel} :{" "}
            <span className="font-medium text-foreground tabular-nums">{ratioFormat.format(ratio)}:1</span>
          </span>
          <StatusBadge tone={verdict.tone} label={verdict.label} live={false} />
        </p>
      ) : null}
    </div>
  )
}
