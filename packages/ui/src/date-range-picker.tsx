import Calendar03Icon from "@hugeicons/core-free-icons/Calendar03Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useState, type FormEvent } from "react"

import { Button } from "./button.tsx"
import { cn } from "./cn.ts"
import { Input } from "./input.tsx"
import { Label } from "./label.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx"

/**
 * Une période en dates civiles, bornes comprises : `{ from: "2026-10-01", to: "2026-10-15" }`.
 * Des chaînes ISO plutôt que des `Date` : une journée n'a pas de fuseau, et la valeur passe telle
 * quelle dans l'URL du produit.
 */
export type DateRange = { from: string; to: string }

export type DateRangePreset = {
  key: string
  label: string
  /** La période, calculée depuis la date du jour (ISO). */
  range: (today: string) => DateRange
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Une date ISO (`2026-10-15`) en `Date` locale à minuit, ou `null` si elle n'existe pas (31 février). */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

/** Une `Date` en date ISO, dans le fuseau du navigateur. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function shift(iso: string, days: number): string {
  const date = parseIsoDate(iso) ?? new Date()
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

function lastDays(days: number): DateRangePreset["range"] {
  return (today) => ({ from: shift(today, -(days - 1)), to: today })
}

/** Périodes proposées par défaut : 7, 30 et 90 jours, ce mois-ci, le mois dernier. */
export const DEFAULT_DATE_RANGE_PRESETS: ReadonlyArray<DateRangePreset> = [
  { key: "7d", label: "7 derniers jours", range: lastDays(7) },
  { key: "30d", label: "30 derniers jours", range: lastDays(30) },
  { key: "90d", label: "90 derniers jours", range: lastDays(90) },
  { key: "month", label: "Ce mois-ci", range: (today) => ({ from: `${today.slice(0, 8)}01`, to: today }) },
  {
    key: "last-month",
    label: "Le mois dernier",
    range: (today) => {
      const first = parseIsoDate(`${today.slice(0, 8)}01`) ?? new Date()
      const end = new Date(first.getFullYear(), first.getMonth(), 0)
      return { from: toIsoDate(new Date(end.getFullYear(), end.getMonth(), 1)), to: toIsoDate(end) }
    },
  },
]

const rangeFormat = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", year: "numeric" })

/**
 * « 1 au 15 oct. 2026 », « 28 sept. au 4 oct. 2026 » : le format de période d'`Intl`, son tiret
 * remplacé par « au », plus lisible et sans tiret long dans l'interface.
 */
export function formatDateRange(range: DateRange): string {
  const from = parseIsoDate(range.from)
  const to = parseIsoDate(range.to)
  if (!from || !to) return "Période invalide"
  if (range.from === range.to) return rangeFormat.format(from)
  return rangeFormat.formatRange(from, to).replace(/\s*[–—-]\s*/u, " au ")
}

/** Erreur d'une période saisie, ou `null` si elle tient. */
export function validateDateRange(range: DateRange, bounds: { min?: string; max?: string } = {}): string | null {
  if (!parseIsoDate(range.from) || !parseIsoDate(range.to)) return "Choisis une date de début et une date de fin."
  if (range.from > range.to) return "La date de début doit précéder la date de fin."
  if (bounds.min && range.from < bounds.min)
    return `Les données commencent le ${formatDateRange({ from: bounds.min, to: bounds.min })}.`
  if (bounds.max && range.to > bounds.max)
    return `Choisis une fin au plus tard le ${formatDateRange({ from: bounds.max, to: bounds.max })}.`
  return null
}

/**
 * Choix d'une période pour un tableau de bord : des raccourcis (7, 30, 90 jours, mois) et une
 * période libre en deux champs de date. Les champs sont ceux du navigateur, sans calendrier
 * maison : clavier, lecteurs d'écran et sélecteur natif du téléphone fonctionnent d'office.
 * Contrôlé : la période vit dans l'URL du produit.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_DATE_RANGE_PRESETS,
  today: todayProp,
  min,
  max,
  label = "Période",
  className,
}: {
  value: DateRange
  onChange: (range: DateRange, preset: string | null) => void
  presets?: ReadonlyArray<DateRangePreset>
  /** Date du jour (ISO), pour les raccourcis ; celle du navigateur par défaut. */
  today?: string
  /** Première date choisissable (ISO) : le début des données. */
  min?: string
  /** Dernière date choisissable (ISO) ; la date du jour par défaut. */
  max?: string
  label?: string
  className?: string
}): React.JSX.Element {
  // La date du navigateur, lue une fois au montage : un rendu ne doit pas dépendre de l'horloge.
  const [browserToday] = useState(() => toIsoDate(new Date()))
  const today = todayProp ?? browserToday
  const upper = max ?? today
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const activePreset = presets.find((p) => {
    const r = p.range(today)
    return r.from === value.from && r.to === value.to
  })
  const summary = activePreset?.label ?? formatDateRange(value)

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(value)
      setError(null)
    }
    setOpen(next)
  }

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const problem = validateDateRange(draft, { ...(min ? { min } : {}), max: upper })
    setError(problem)
    if (problem) return
    onChange(draft, null)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className={cn("justify-start", className)} />}
        aria-label={`${label} : ${summary}`}
      >
        <HugeiconsIcon icon={Calendar03Icon} aria-hidden data-icon="inline-start" />
        <span className="truncate">{summary}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-1rem))] gap-0 p-0" aria-label={label}>
        <div className="grid sm:grid-cols-[12rem_1fr]">
          <ul
            aria-label="Raccourcis"
            className="grid content-start gap-0.5 border-b border-border p-1.5 sm:border-r sm:border-b-0"
          >
            {presets.map((preset) => {
              const pressed = preset.key === activePreset?.key
              return (
                <li key={preset.key}>
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => {
                      onChange(preset.range(today), preset.key)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 lg:min-h-9 coarse:min-h-11",
                      pressed && "bg-muted font-medium",
                    )}
                  >
                    {preset.label}
                  </button>
                </li>
              )
            })}
          </ul>
          <form onSubmit={apply} noValidate className="grid content-start gap-3 p-4">
            <p className="text-sm font-medium">Période libre</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-from`}>Du</Label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  value={draft.from}
                  {...(min ? { min } : {})}
                  max={upper}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => setDraft((d) => ({ ...d, from: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-to`}>Au</Label>
                <Input
                  id={`${id}-to`}
                  type="date"
                  value={draft.to}
                  {...(min ? { min } : {})}
                  max={upper}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => setDraft((d) => ({ ...d, to: event.target.value }))}
                />
              </div>
            </div>
            {error ? (
              <p id={`${id}-error`} role="alert" className="soft-in text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="sm" className="justify-self-end">
              Appliquer
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}
