// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Button } from "./button.tsx"
import { FieldError } from "./field.tsx"
import { ThemeProvider, useTheme } from "./theme.tsx"

afterEach(cleanup)

describe("Button", () => {
  it("rend un vrai bouton qui ne soumet pas de formulaire", () => {
    render(<Button>Enregistrer</Button>)
    expect(screen.getByRole("button", { name: "Enregistrer" }).getAttribute("type")).toBe("button")
  })

  it("se désactive pendant le chargement et garde son libellé lisible", () => {
    render(<Button isLoading>Enregistrer</Button>)
    const button = screen.getByRole("button", { name: "Enregistrer" })
    expect(button.hasAttribute("disabled")).toBe(true)
  })

  it("laisse à un lien sa sémantique de lien", () => {
    render(<Button render={<a href="/docs" />}>Documentation</Button>)
    const link = screen.getByRole("link", { name: "Documentation" })
    expect(link.getAttribute("role")).toBeNull()
    expect(link.getAttribute("type")).toBeNull()
  })
})

describe("FieldError", () => {
  it("ne rend rien sans erreur", () => {
    const { container } = render(<FieldError errors={[]} />)
    expect(container.innerHTML).toBe("")
  })

  it("affiche une seule fois un message répété", () => {
    render(<FieldError errors={[{ message: "Adresse invalide" }, { message: "Adresse invalide" }]} />)
    expect(screen.getByRole("alert").textContent).toBe("Adresse invalide")
  })

  it("liste plusieurs messages distincts", () => {
    render(<FieldError errors={[{ message: "Trop court" }, { message: "Chiffre manquant" }]} />)
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Trop court", "Chiffre manquant"])
  })
})

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ""
  })

  function Toggle() {
    const { theme, setTheme } = useTheme()
    return <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme}</Button>
  }

  it("part du thème clair et mémorise le choix du sombre", () => {
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    const button = screen.getByRole("button", { name: "light" })
    act(() => button.click())
    expect(button.textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("theme")).toBe("dark")
  })

  it("reprend le thème mémorisé", () => {
    localStorage.setItem("theme", "dark")
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    expect(screen.getByRole("button", { name: "dark" })).toBeDefined()
  })
})
