import { useId } from "react"

import { cn } from "./cn.ts"
import { Input } from "./input.tsx"
import { Label } from "./label.tsx"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.tsx"

/**
 * Adresse postale structurée, telle que la facture QR suisse l'exige depuis novembre 2025
 * (adresse de type S) : rue et numéro séparés, NPA et localité séparés, pays en code ISO.
 */
export type PostalAddress = {
  /** « Rue du Lac ». */
  street: string
  /** « 12 », « 12b » ; vide pour une adresse sans numéro. */
  number: string
  /** Complément : « c/o Acme SA », « Case postale 42 ». */
  extra: string
  /** NPA : « 1003 ». */
  postalCode: string
  /** « Lausanne ». */
  locality: string
  /** Code ISO 3166-1 alpha-2 : « CH ». */
  country: string
}

export type AddressCountry = { code: string; label: string }

/** Pays proposés par défaut : la Suisse et le Liechtenstein, qui partagent les NPA à quatre chiffres. */
export const DEFAULT_ADDRESS_COUNTRIES: ReadonlyArray<AddressCountry> = [
  { code: "CH", label: "Suisse" },
  { code: "LI", label: "Liechtenstein" },
]

export const EMPTY_ADDRESS: PostalAddress = {
  street: "",
  number: "",
  extra: "",
  postalCode: "",
  locality: "",
  country: "CH",
}

export type AddressErrors = Partial<Record<keyof PostalAddress, string>>

/**
 * Erreurs d'une adresse, champ par champ ; objet vide si elle tient. Limites de longueur de la
 * facture QR : 70 caractères pour la rue, 16 pour le numéro et le NPA, 35 pour la localité.
 */
export function validatePostalAddress(address: PostalAddress): AddressErrors {
  const errors: AddressErrors = {}
  const street = address.street.trim()
  const postalCode = address.postalCode.trim()
  const locality = address.locality.trim()
  if (!street) errors.street = "Indique la rue."
  else if (street.length > 70) errors.street = "70 caractères au plus."
  if (address.number.trim().length > 16) errors.number = "16 caractères au plus."
  if (!postalCode) errors.postalCode = "Indique le NPA."
  else if ((address.country === "CH" || address.country === "LI") && !/^[1-9]\d{3}$/.test(postalCode))
    errors.postalCode = "Le NPA a quatre chiffres."
  else if (postalCode.length > 16) errors.postalCode = "16 caractères au plus."
  if (!locality) errors.locality = "Indique la localité."
  else if (locality.length > 35) errors.locality = "35 caractères au plus."
  if (!/^[A-Z]{2}$/.test(address.country)) errors.country = "Choisis un pays."
  return errors
}

/** L'adresse sur trois lignes, comme sur une enveloppe : « Rue du Lac 12 », « c/o… », « 1003 Lausanne ». */
export function formatPostalAddress(
  address: PostalAddress,
  countries: ReadonlyArray<AddressCountry> = DEFAULT_ADDRESS_COUNTRIES,
): Array<string> {
  const lines = [
    [address.street.trim(), address.number.trim()].filter(Boolean).join(" "),
    address.extra.trim(),
    [address.postalCode.trim(), address.locality.trim()].filter(Boolean).join(" "),
  ]
  if (address.country !== "CH") lines.push(countries.find((c) => c.code === address.country)?.label ?? address.country)
  return lines.filter(Boolean)
}

function Part({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string
  label: string
  error: string | undefined
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="soft-in text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Les champs d'une adresse postale suisse : rue et numéro, complément, NPA et localité, pays.
 * Chaque champ porte son `autocomplete` : le navigateur remplit tout d'un geste.
 * Rue et numéro, puis NPA et localité, restent côte à côte jusque sur téléphone.
 *
 * Contrôlé ; `errors` vient de `validatePostalAddress` (à l'envoi, pas à chaque frappe).
 */
export function AddressFields({
  value,
  onChange,
  errors = {},
  countries = DEFAULT_ADDRESS_COUNTRIES,
  legend = "Adresse",
  disabled,
  className,
}: {
  value: PostalAddress
  onChange: (address: PostalAddress) => void
  errors?: AddressErrors
  /** Un seul pays : le choix disparaît. */
  countries?: ReadonlyArray<AddressCountry>
  legend?: string
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  const base = useId()
  const id = (key: keyof PostalAddress) => `${base}-${key}`
  const set = (key: keyof PostalAddress) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: event.target.value })
  const invalid = (key: keyof PostalAddress) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": `${id(key)}-error` } : {}

  return (
    <fieldset data-slot="address-fields" disabled={disabled} className={cn("grid gap-4", className)}>
      <legend className="mb-3 text-base font-medium">{legend}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 sm:grid-cols-[minmax(0,1fr)_7rem] sm:gap-4">
        <Part id={id("street")} label="Rue" error={errors.street}>
          <Input
            id={id("street")}
            value={value.street}
            onChange={set("street")}
            autoComplete="address-line1"
            maxLength={70}
            {...invalid("street")}
          />
        </Part>
        <Part id={id("number")} label="Numéro" error={errors.number}>
          <Input
            id={id("number")}
            value={value.number}
            onChange={set("number")}
            autoComplete="off"
            maxLength={16}
            {...invalid("number")}
          />
        </Part>
      </div>
      <Part id={id("extra")} label="Complément (facultatif)" error={errors.extra}>
        <Input
          id={id("extra")}
          value={value.extra}
          onChange={set("extra")}
          autoComplete="address-line2"
          placeholder="c/o, case postale"
          {...invalid("extra")}
        />
      </Part>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
        <Part id={id("postalCode")} label="NPA" error={errors.postalCode}>
          <Input
            id={id("postalCode")}
            value={value.postalCode}
            onChange={set("postalCode")}
            autoComplete="postal-code"
            inputMode={value.country === "CH" || value.country === "LI" ? "numeric" : "text"}
            maxLength={16}
            {...invalid("postalCode")}
          />
        </Part>
        <Part id={id("locality")} label="Localité" error={errors.locality}>
          <Input
            id={id("locality")}
            value={value.locality}
            onChange={set("locality")}
            autoComplete="address-level2"
            maxLength={35}
            {...invalid("locality")}
          />
        </Part>
      </div>
      {countries.length > 1 ? (
        <Part id={id("country")} label="Pays" error={errors.country}>
          <Select
            value={value.country}
            onValueChange={(next: string | null) => {
              if (next) onChange({ ...value, country: next })
            }}
            {...(disabled ? { disabled } : {})}
          >
            <SelectTrigger id={id("country")} {...invalid("country")}>
              <SelectValue items={Object.fromEntries(countries.map((c) => [c.code, c.label]))} />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Part>
      ) : null}
    </fieldset>
  )
}
