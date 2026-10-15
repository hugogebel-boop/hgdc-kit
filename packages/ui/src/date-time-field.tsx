import { Input } from "./input.tsx"

/** Un instant (millisecondes) en valeur de `<input type="datetime-local">`, à la minute, dans le fuseau du navigateur. */
export function toDateTimeLocal(time: number): string {
  const date = new Date(time)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/** La valeur d'un champ `datetime-local` en instant (millisecondes), ou `null` si elle est vide ou invalide. */
export function fromDateTimeLocal(value: string): number | null {
  const match = LOCAL.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const date = new Date(year, month - 1, day, hour, minute, second)
  // `Date` corrige un 31 février en 3 mars : une date qui n'existe pas est refusée.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date.getTime()
}

/**
 * Date et heure d'un envoi programmé, d'une fenêtre de maintenance : le champ du navigateur
 * (sélecteur natif sur téléphone, clavier, lecteurs d'écran), avec la valeur en millisecondes
 * comme Convex la stocke. L'heure est celle du navigateur, à la minute.
 *
 * Dans un `Field`, le libellé et la description se relient tout seuls.
 */
export function DateTimeField({
  value,
  onChange,
  min,
  max,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "defaultValue"> & {
  value: number | null
  onChange: (value: number | null) => void
  /** Instant le plus tôt accepté (millisecondes) : `Date.now()` pour un envoi programmé. */
  min?: number
  max?: number
}): React.JSX.Element {
  return (
    <Input
      {...props}
      type="datetime-local"
      step={60}
      value={value === null ? "" : toDateTimeLocal(value)}
      {...(min !== undefined ? { min: toDateTimeLocal(min) } : {})}
      {...(max !== undefined ? { max: toDateTimeLocal(max) } : {})}
      onChange={(event) => onChange(fromDateTimeLocal(event.target.value))}
      {...(className !== undefined ? { className } : {})}
    />
  )
}
