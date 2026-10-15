// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AddressFields,
  EMPTY_ADDRESS,
  formatPostalAddress,
  validatePostalAddress,
  type PostalAddress,
} from "./address-fields.tsx"
import { ColorField, contrastRatio, contrastVerdict, normalizeHexColor } from "./color-field.tsx"
import {
  DEFAULT_DATE_RANGE_PRESETS,
  DateRangePicker,
  formatDateRange,
  parseIsoDate,
  validateDateRange,
  type DateRange,
} from "./date-range-picker.tsx"
import { DateTimeField, fromDateTimeLocal, toDateTimeLocal } from "./date-time-field.tsx"
import { Field, FieldLabel } from "./field.tsx"
import { MoneyField, formatChf, formatMoney, parseMoney } from "./money-field.tsx"
import { SettingsSection } from "./settings-section.tsx"

afterEach(cleanup)

describe("SettingsSection", () => {
  it("est une région nommée par son titre, décrite par sa description", () => {
    render(
      <SettingsSection title="Nom de l'espace" description="Visible par les membres.">
        <p>Champs</p>
      </SettingsSection>,
    )
    const region = screen.getByRole("region", { name: "Nom de l'espace" })
    expect(region.getAttribute("aria-describedby")).toBe(screen.getByText("Visible par les membres.").id)
  })

  it("enregistre par son bouton ou par Entrée, seulement s'il y a un changement", () => {
    const onSave = vi.fn<() => void>()
    const { rerender } = render(
      <SettingsSection title="Build" onSave={onSave} dirty={false}>
        <input aria-label="Commande" />
      </SettingsSection>,
    )
    const save = screen.getByRole("button", { name: "Enregistrer" })
    expect(save.hasAttribute("disabled")).toBe(true)
    fireEvent.submit(screen.getByRole("form", { name: "Build" }))
    expect(onSave).not.toHaveBeenCalled()

    rerender(
      <SettingsSection title="Build" onSave={onSave} dirty footerNote="Appliqué au prochain déploiement.">
        <input aria-label="Commande" />
      </SettingsSection>,
    )
    expect(save.hasAttribute("disabled")).toBe(false)
    fireEvent.submit(screen.getByRole("form", { name: "Build" }))
    expect(onSave).toHaveBeenCalledOnce()
    expect(screen.getByText("Appliqué au prochain déploiement.")).toBeDefined()
  })

  it("bloque un deuxième envoi pendant l'enregistrement", () => {
    const onSave = vi.fn<() => void>()
    render(<SettingsSection title="Build" onSave={onSave} saving />)
    fireEvent.submit(screen.getByRole("form", { name: "Build" }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it("pose les actions libres d'une zone dangereuse", () => {
    render(
      <SettingsSection title="Supprimer" tone="danger" footer={<button type="button">Supprimer le projet</button>} />,
    )
    expect(screen.getByRole("region", { name: "Supprimer" }).className).toContain("ring-destructive/30")
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull()
  })
})

describe("montants", () => {
  it("écrit les centimes au format suisse, apostrophe typographique", () => {
    expect(formatMoney(125050)).toBe("1’250.50")
    expect(formatMoney(100000000)).toBe("1’000’000.00")
    expect(formatMoney(5)).toBe("0.05")
    expect(formatMoney(-500)).toBe("-5.00")
    expect(formatChf(1990)).toBe("CHF 19.90")
  })

  it("lit les écritures courantes sans flottants", () => {
    expect(parseMoney("1’250.50")).toEqual({ ok: true, centimes: 125050 })
    expect(parseMoney("1'250,5")).toEqual({ ok: true, centimes: 125050 })
    expect(parseMoney("CHF 12.–")).toEqual({ ok: true, centimes: 1200 })
    expect(parseMoney("12.-")).toEqual({ ok: true, centimes: 1200 })
    expect(parseMoney("0.29")).toEqual({ ok: true, centimes: 29 })
    expect(parseMoney(".5")).toEqual({ ok: true, centimes: 50 })
    expect(parseMoney("1 234,00")).toEqual({ ok: true, centimes: 123400 })
    expect(parseMoney("")).toEqual({ ok: true, centimes: null })
  })

  it("refuse trois décimales, deux séparateurs ou des lettres", () => {
    expect(parseMoney("1.234")).toEqual({ ok: false })
    expect(parseMoney("1,250.50")).toEqual({ ok: false })
    expect(parseMoney("douze")).toEqual({ ok: false })
    expect(parseMoney(".")).toEqual({ ok: false })
  })

  it("rend des centimes en tapant, et se remet au format en quittant le champ", () => {
    const onChange = vi.fn<(c: number | null) => void>()
    function Harness() {
      const [value, setValue] = useState<number | null>(null)
      return (
        <Field>
          <FieldLabel>Prix</FieldLabel>
          <MoneyField
            value={value}
            onChange={(c) => {
              onChange(c)
              setValue(c)
            }}
          />
        </Field>
      )
    }
    render(<Harness />)
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Prix" })
    expect(input.getAttribute("inputmode")).toBe("decimal")
    fireEvent.change(input, { target: { value: "1250,5" } })
    expect(onChange).toHaveBeenLastCalledWith(125050)
    fireEvent.blur(input)
    expect(input.value).toBe("1’250.50")
  })

  it("explique une saisie invalide ou négative, sans appeler onChange", () => {
    const onChange = vi.fn<(c: number | null) => void>()
    render(<MoneyField aria-label="Budget" value={null} onChange={onChange} />)
    const input = screen.getByRole("textbox", { name: "Budget" })
    fireEvent.change(input, { target: { value: "-5" } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("Au moins CHF 0.00.")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    fireEvent.change(input, { target: { value: "abc" } })
    fireEvent.blur(input)
    expect(screen.getByRole("alert").textContent).toContain("Montant invalide")
  })
})

describe("couleurs", () => {
  it("normalise les codes hexadécimaux", () => {
    expect(normalizeHexColor("#7C3AED")).toBe("#7c3aed")
    expect(normalizeHexColor("abc")).toBe("#aabbcc")
    expect(normalizeHexColor("#12345")).toBeNull()
    expect(normalizeHexColor("rouge")).toBeNull()
  })

  it("calcule le contraste WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5)
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2)
    expect(contrastRatio("x", "#fff")).toBeNull()
    expect(contrastVerdict(4.5).tone).toBe("success")
    expect(contrastVerdict(3.2).tone).toBe("warning")
    expect(contrastVerdict(1.5).tone).toBe("danger")
  })

  it("transmet un code complet, et dit le contraste avec le texte blanc", () => {
    const onChange = vi.fn<(v: string) => void>()
    function Harness() {
      const [value, setValue] = useState("#7c3aed")
      return (
        <ColorField
          aria-label="Couleur de marque"
          value={value}
          onChange={(v) => {
            onChange(v)
            setValue(v)
          }}
        />
      )
    }
    render(<Harness />)
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Couleur de marque" })
    expect(screen.getByText("Lisible")).toBeDefined()
    fireEvent.change(input, { target: { value: "#ff" } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "#ffee00" } })
    expect(onChange).toHaveBeenLastCalledWith("#ffee00")
    expect(screen.getByText("Illisible")).toBeDefined()
    expect(input.getAttribute("aria-describedby")).toContain("contrast")
  })

  it("développe la forme courte et reprend la dernière couleur valable en quittant le champ", () => {
    const onChange = vi.fn<(v: string) => void>()
    render(<ColorField aria-label="Couleur" value="#000000" onChange={onChange} contrastWith={null} />)
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Couleur" })
    fireEvent.change(input, { target: { value: "#abc" } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith("#aabbcc")
    fireEvent.change(input, { target: { value: "zz" } })
    fireEvent.blur(input)
    expect(input.value).toBe("#000000")
    expect(screen.queryByText(/Contraste/)).toBeNull()
  })
})

describe("dates", () => {
  it("lit une date ISO et refuse une date qui n'existe pas", () => {
    expect(parseIsoDate("2026-02-28")?.getDate()).toBe(28)
    expect(parseIsoDate("2026-02-31")).toBeNull()
    expect(parseIsoDate("15.10.2026")).toBeNull()
  })

  it("écrit une période avec « au », sans tiret long", () => {
    expect(formatDateRange({ from: "2026-10-01", to: "2026-10-15" })).toBe("1 au 15 oct. 2026")
    expect(formatDateRange({ from: "2026-09-28", to: "2026-10-04" })).toBe("28 sept. au 4 oct. 2026")
    expect(formatDateRange({ from: "2026-10-15", to: "2026-10-15" })).toBe("15 oct. 2026")
    expect(formatDateRange({ from: "2026-10-01", to: "2026-10-15" })).not.toMatch(/[–—]/)
  })

  it("calcule les raccourcis depuis la date du jour", () => {
    const ranges = Object.fromEntries(DEFAULT_DATE_RANGE_PRESETS.map((p) => [p.key, p.range("2026-03-15")]))
    expect(ranges["7d"]).toEqual({ from: "2026-03-09", to: "2026-03-15" })
    expect(ranges["30d"]).toEqual({ from: "2026-02-14", to: "2026-03-15" })
    expect(ranges["month"]).toEqual({ from: "2026-03-01", to: "2026-03-15" })
    expect(ranges["last-month"]).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(DEFAULT_DATE_RANGE_PRESETS.find((p) => p.key === "last-month")?.range("2026-01-10")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    })
  })

  it("valide une période libre", () => {
    expect(validateDateRange({ from: "2026-10-10", to: "2026-10-01" })).toMatch(/précéder/)
    expect(validateDateRange({ from: "", to: "2026-10-01" })).toMatch(/Choisis/)
    expect(validateDateRange({ from: "2026-10-01", to: "2026-10-20" }, { max: "2026-10-15" })).toMatch(/au plus tard/)
    expect(validateDateRange({ from: "2026-10-01", to: "2026-10-15" }, { max: "2026-10-15" })).toBeNull()
  })

  it("ouvre les raccourcis, en applique un, puis une période libre", async () => {
    const onChange = vi.fn<(r: DateRange, preset: string | null) => void>()
    function Harness() {
      const [range, setRange] = useState<DateRange>({ from: "2026-10-09", to: "2026-10-15" })
      return (
        <DateRangePicker
          value={range}
          today="2026-10-15"
          onChange={(r, p) => {
            onChange(r, p)
            setRange(r)
          }}
        />
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole("button", { name: "Période : 7 derniers jours" })
    fireEvent.click(trigger)
    const preset = await screen.findByRole("button", { name: "30 derniers jours" })
    expect(screen.getByRole("button", { name: "7 derniers jours" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(preset)
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-09-16", to: "2026-10-15" }, "30d")

    fireEvent.click(screen.getByRole("button", { name: "Période : 30 derniers jours" }))
    const from = await screen.findByLabelText("Du")
    fireEvent.change(from, { target: { value: "2026-10-12" } })
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-10-02" } })
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }))
    expect(screen.getByRole("alert").textContent).toMatch(/précéder/)
    expect(from.getAttribute("aria-invalid")).toBe("true")
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-10-14" } })
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }))
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-10-12", to: "2026-10-14" }, null)
  })

  it("convertit un champ datetime-local en millisecondes et retour", () => {
    const time = new Date(2026, 9, 15, 9, 30).getTime()
    expect(toDateTimeLocal(time)).toBe("2026-10-15T09:30")
    expect(fromDateTimeLocal("2026-10-15T09:30")).toBe(time)
    expect(fromDateTimeLocal("")).toBeNull()
    expect(fromDateTimeLocal("2026-02-31T10:00")).toBeNull()
  })

  it("rend un champ date et heure relié à son libellé", () => {
    const onChange = vi.fn<(v: number | null) => void>()
    const min = new Date(2026, 9, 15, 8, 0).getTime()
    render(
      <Field>
        <FieldLabel>Envoi programmé</FieldLabel>
        <DateTimeField value={null} onChange={onChange} min={min} />
      </Field>,
    )
    const input = screen.getByLabelText("Envoi programmé")
    expect(input.getAttribute("type")).toBe("datetime-local")
    expect(input.getAttribute("min")).toBe("2026-10-15T08:00")
    fireEvent.change(input, { target: { value: "2026-10-16T10:15" } })
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 16, 10, 15).getTime())
  })
})

describe("adresses", () => {
  const lausanne: PostalAddress = {
    street: "Rue du Lac",
    number: "12",
    extra: "",
    postalCode: "1003",
    locality: "Lausanne",
    country: "CH",
  }

  it("valide une adresse suisse structurée", () => {
    expect(validatePostalAddress(lausanne)).toEqual({})
    expect(validatePostalAddress(EMPTY_ADDRESS)).toMatchObject({
      street: "Indique la rue.",
      postalCode: "Indique le NPA.",
      locality: "Indique la localité.",
    })
    expect(validatePostalAddress({ ...lausanne, postalCode: "0123" }).postalCode).toBe("Le NPA a quatre chiffres.")
    expect(validatePostalAddress({ ...lausanne, postalCode: "75001", country: "FR" })).toEqual({})
  })

  it("écrit l'adresse comme sur une enveloppe", () => {
    expect(formatPostalAddress(lausanne)).toEqual(["Rue du Lac 12", "1003 Lausanne"])
    expect(
      formatPostalAddress({ ...lausanne, extra: "c/o Acme SA", country: "LI", locality: "Vaduz", postalCode: "9490" }),
    ).toEqual(["Rue du Lac 12", "c/o Acme SA", "9490 Vaduz", "Liechtenstein"])
  })

  it("relie chaque champ à son libellé, son autocomplete et son erreur", () => {
    const onChange = vi.fn<(a: PostalAddress) => void>()
    render(<AddressFields value={lausanne} onChange={onChange} errors={{ postalCode: "Le NPA a quatre chiffres." }} />)
    expect(screen.getByRole("group", { name: "Adresse" })).toBeDefined()
    expect(screen.getByLabelText("Rue").getAttribute("autocomplete")).toBe("address-line1")
    const npa = screen.getByLabelText("NPA")
    expect(npa.getAttribute("autocomplete")).toBe("postal-code")
    expect(npa.getAttribute("inputmode")).toBe("numeric")
    expect(npa.getAttribute("aria-invalid")).toBe("true")
    expect(npa.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
    fireEvent.change(screen.getByLabelText("Localité"), { target: { value: "Pully" } })
    expect(onChange).toHaveBeenCalledWith({ ...lausanne, locality: "Pully" })
  })

  it("retire le choix du pays quand il n'y en a qu'un", () => {
    render(<AddressFields value={lausanne} onChange={() => {}} countries={[{ code: "CH", label: "Suisse" }]} />)
    expect(screen.queryByText("Pays")).toBeNull()
  })
})
