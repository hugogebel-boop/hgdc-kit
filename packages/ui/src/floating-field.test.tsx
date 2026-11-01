// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FloatingField } from "./floating-field.tsx"

afterEach(cleanup)

describe("FloatingField", () => {
  it("nomme le champ par son libellé, avec le placeholder vide qui fait flotter le libellé", () => {
    render(<FloatingField label="Adresse e-mail" type="email" />)
    const input = screen.getByLabelText("Adresse e-mail")
    expect(input.getAttribute("placeholder")).toBe(" ")
    expect(input.getAttribute("aria-invalid")).toBeNull()
    expect(input.getAttribute("aria-describedby")).toBeNull()
  })

  it("cite l'erreur et passe le champ en invalide", () => {
    render(<FloatingField label="Mot de passe" type="password" error="Mot de passe incorrect." description="Aide" />)
    const input = screen.getByLabelText("Mot de passe")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    const error = screen.getByText("Mot de passe incorrect.").closest("p")
    expect(input.getAttribute("aria-describedby")).toBe(error?.id)
    // L'aide s'efface devant l'erreur.
    expect(screen.queryByText("Aide")).toBeNull()
  })

  it("cite la description sans erreur, et garde un aria-describedby passé par l'appelant", () => {
    render(<FloatingField label="Prénom" description="Tel qu'il apparaîtra." aria-describedby="autre" />)
    const input = screen.getByLabelText("Prénom")
    const description = screen.getByText("Tel qu'il apparaîtra.")
    expect(input.getAttribute("aria-describedby")).toBe(`${description.id} autre`)
  })

  it("garde un id explicite", () => {
    render(<FloatingField label="Code" id="code" />)
    expect(screen.getByLabelText("Code").id).toBe("code")
  })
})
