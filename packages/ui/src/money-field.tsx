import { useId, useState } from "react"

import { cn } from "./cn.ts"
import { useFieldDescribedBy, useFieldId } from "./field.tsx"
import { Input } from "./input.tsx"

/** Apostrophe typographique, séparateur des milliers en Suisse : « 1’250.50 ». */
const GROUP = "’"

/** Des centimes en montant suisse : `125050` → « 1’250.50 », `-500` → « -5.00 ». */
export function formatMoney(centimes: number): string {
  const sign = centimes < 0 ? "-" : ""
  const abs = Math.abs(Math.round(centimes))
  const francs = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
  return `${sign}${francs}.${String(abs % 100).padStart(2, "0")}`
}

/** Comme `formatMoney`, précédé de la devise : « CHF 1’250.50 ». */
export function formatChf(centimes: number): string {
  return `CHF ${formatMoney(centimes)}`
}

export type MoneyParse = { ok: true; centimes: number | null } | { ok: false }

/**
 * Lit un montant saisi, en centimes, sans passer par les flottants. Accepte les écritures d'ici :
 * « 1’250.50 », « 1'250,50 », « 1 250.5 », « CHF 12.– », « 12.- ». Vide : `centimes: null`.
 * Plus de deux décimales, deux virgules ou des lettres : `ok: false`.
 */
export function parseMoney(text: string): MoneyParse {
  const compact = text
    .replace(/^\s*(CHF|Fr\.)\s*/i, "")
    // `\s` couvre aussi les espaces insécables qu'Intl met entre les milliers.
    .replace(/[\s'’]/g, "")
    .replace(/\.[-–—]$/, "")
    .replace(",", ".")
  if (compact === "") return { ok: true, centimes: null }
  const match = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(compact)
  if (!match || (match[2] === "" && !match[3])) return { ok: false }
  const francs = Number(match[2] || "0")
  const cents = Number((match[3] ?? "").padEnd(2, "0"))
  const centimes = francs * 100 + cents
  if (!Number.isSafeInteger(centimes)) return { ok: false }
  return { ok: true, centimes: match[1] && centimes !== 0 ? -centimes : centimes }
}

/**
 * Un montant en francs suisses, stocké en centimes (entier) : prix, budget, seuil d'alerte. Le
 * champ accepte les écritures courantes (apostrophe, virgule, « 12.– ») et se remet au format
 * suisse en quittant le champ. Clavier numérique sur téléphone.
 *
 * Une saisie invalide ou hors bornes n'appelle pas `onChange` et s'explique sous le champ.
 */
export function MoneyField({
  value,
  onChange,
  min = 0,
  max,
  className,
  id: idProp,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "min" | "max" | "type" | "defaultValue"> & {
  /** En centimes ; `null` : vide. */
  value: number | null
  onChange: (centimes: number | null) => void
  /** En centimes, `0` par défaut (pas de montant négatif) ; `null` : sans borne. */
  min?: number | null
  max?: number
}): React.JSX.Element {
  const fieldId = useFieldId()
  const fieldDescribedBy = useFieldDescribedBy()
  const ownId = useId()
  const id = idProp ?? fieldId ?? ownId
  const errorId = `${id}-money-error`
  const display = (centimes: number | null) => (centimes === null ? "" : formatMoney(centimes))
  const [text, setText] = useState(display(value))
  const [shown, setShown] = useState(value)
  const [error, setError] = useState<string | null>(null)
  // Un montant changé par le produit (réinitialisation) remplace la saisie.
  if (shown !== value) {
    setShown(value)
    const parsed = parseMoney(text)
    if (!parsed.ok || parsed.centimes !== value) setText(display(value))
  }

  const check = (next: string): { centimes: number | null } | { error: string } => {
    const parsed = parseMoney(next)
    if (!parsed.ok) return { error: "Montant invalide. Écris par exemple 1’250.50." }
    const { centimes } = parsed
    if (centimes !== null && min !== null && centimes < min) return { error: `Au moins ${formatChf(min)}.` }
    if (centimes !== null && max !== undefined && centimes > max) return { error: `Au plus ${formatChf(max)}.` }
    return { centimes }
  }

  const describedBy = [props["aria-describedby"] ?? fieldDescribedBy, error ? errorId : null].filter(Boolean).join(" ")

  return (
    <div data-slot="money-field" className={cn("grid gap-1.5", className)}>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground"
        >
          CHF
        </span>
        <Input
          {...props}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const result = check(next)
            if ("error" in result) return
            setError(null)
            if (result.centimes !== value) {
              setShown(result.centimes)
              onChange(result.centimes)
            }
          }}
          onBlur={(event) => {
            props.onBlur?.(event)
            const result = check(text)
            if ("error" in result) return setError(result.error)
            setError(null)
            setText(display(result.centimes))
          }}
          className="pl-12 text-right tabular-nums"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="soft-in text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
