// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell } from "./app-shell.tsx"
import { Checkbox } from "./checkbox.tsx"
import { Snippet } from "./copy-button.tsx"
import { Empty } from "./empty.tsx"
import { initials } from "./initials.ts"
import { MemberItem } from "./member-item.tsx"
import { OrgMark, RoleBadge } from "./org-switcher.tsx"
import { Page } from "./page-header.tsx"
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx"
import { ResourceItem, ResourceList } from "./resource-list.tsx"
import { Table, TableHead, TableHeader, TableRow } from "./table.tsx"

afterEach(cleanup)
// Le bandeau d'état (`AppShell`) lit la page de statut : jamais de réseau ici, une lecture ratée n'affiche rien.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("hors ligne"))),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("initials", () => {
  it("donne la même règle à une personne et à une organisation", () => {
    expect(initials("Test vérif")).toBe("TV")
    expect(initials("Ada Lovelace")).toBe("AL")
    expect(initials("  hugo   gebel  ")).toBe("HG")
    expect(initials("Acme")).toBe("A")
    expect(initials("Élise Dupont Martin")).toBe("ÉD")
  })

  it("se rabat sur l'adresse e-mail, puis sur « ? »", () => {
    expect(initials("", "jean.dupont@example.ch")).toBe("JD")
    expect(initials(null, "info@example.ch")).toBe("I")
    expect(initials("   ")).toBe("?")
  })

  it("sert la marque d'une organisation sans logo", () => {
    const { container } = render(<OrgMark org={{ name: "Test vérif" }} />)
    expect(container.textContent).toBe("TV")
  })

  it("teinte la marque d'une organisation selon son identifiant, pas selon ses initiales", () => {
    const ids = ["org_a", "org_b", "org_c", "org_d", "org_e", "org_f", "org_g", "org_h"]
    const tones = new Set(
      ids.map((id) => {
        const { container } = render(<OrgMark org={{ id, name: "Organisation de test" }} />)
        const mark = container.firstElementChild as HTMLElement
        cleanup()
        return mark.className.match(/bg-avatar-[1-7]/)?.[0]
      }),
    )
    expect(tones.has(undefined)).toBe(false)
    expect(tones.size).toBeGreaterThan(1)
  })
})

describe("AppShell, barre du haut", () => {
  it("garde la marque du produit sur téléphone et la recherche à droite", () => {
    const onSearch = vi.fn<() => void>()
    const { container } = render(
      <AppShell product="analytics" nav={null} header={<span>Contexte</span>} onSearch={onSearch}>
        Page
      </AppShell>,
    )
    const header = container.querySelector("header") as HTMLElement
    const brand = header.querySelector("[data-slot=app-shell-brand]") as HTMLElement
    expect(brand.textContent).toBe("Analytics")
    expect(brand.querySelector("img")).not.toBeNull()
    expect(brand.className).toContain("lg:hidden")
    const search = screen.getByRole("button", { name: /Rechercher/ })
    // Toujours le dernier élément de la barre, même largeur partout.
    expect(header.lastElementChild).toBe(search)
    expect(search.className).toContain("lg:w-96")
    fireEvent.click(search)
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it("pose la même boîte de contenu dans tous les produits", () => {
    render(
      <AppShell product="account" nav={null}>
        Page
      </AppShell>,
    )
    expect(screen.getByRole("main").className).toContain("max-w-6xl")
  })
})

describe("Page", () => {
  it("lit sur une colonne par défaut, toute la largeur avec `wide`", () => {
    const { container, rerender } = render(<Page title="Réglages">Formulaire</Page>)
    const page = container.querySelector("[data-slot=page]") as HTMLElement
    expect(page.className).toContain("max-w-3xl")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Réglages")
    rerender(
      <Page title="Projets" wide>
        Tableau
      </Page>,
    )
    expect((container.querySelector("[data-slot=page]") as HTMLElement).className).not.toContain("max-w-3xl")
  })
})

describe("États et rôles", () => {
  it("donne une carte à l'état vide d'une page", () => {
    const { container } = render(<Empty variant="card">Rien</Empty>)
    const empty = container.firstElementChild as HTMLElement
    expect(empty.className).toContain("surface")
    expect(empty.dataset.variant).toBe("card")
  })

  it("garde un badge de rôle neutre, visible sur téléphone", () => {
    render(
      <ResourceList>
        <MemberItem name="Test vérif" email="test@example.ch" orgRole="owner" isMe />
        <ResourceItem title="Autre" badge={<RoleBadge orgRole="admin" />} />
      </ResourceList>,
    )
    const owner = screen.getByText("Propriétaire")
    expect(owner.dataset.tone).toBe("neutral")
    expect(owner.parentElement?.className).not.toContain("hidden")
    expect(screen.getByText("TV")).toBeDefined()
    expect(screen.getByText("(toi)")).toBeDefined()
    expect(screen.getByText("Admin").dataset.tone).toBe("neutral")
  })

  it("garde le fond coché d'une case et d'un bouton radio en thème sombre", () => {
    render(
      <>
        <Checkbox defaultChecked aria-label="Case" />
        <RadioGroup defaultValue="a" aria-label="Choix">
          <RadioGroupItem value="a" aria-label="A" />
        </RadioGroup>
      </>,
    )
    expect(screen.getByRole("checkbox").className).toContain("dark:data-checked:bg-primary")
    expect(screen.getByRole("radio").className).toContain("dark:data-checked:bg-primary")
  })

  it("fait défiler une commande trop longue au lieu de la couper ou de déborder", () => {
    const { container } = render(<Snippet value="vercel --api https://api.example.ch --token ah_x deploy" prompt />)
    const snippet = container.querySelector("[data-slot=snippet]") as HTMLElement
    expect(snippet.className).toContain("max-w-full")
    expect((snippet.querySelector("pre") as HTMLElement).className).toContain("overflow-x-auto")
  })

  it("pose l'icône de tri après le libellé, colonne de chiffres comprise", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead numeric sort="none" onSort={() => {}}>
              CHF
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    )
    const button = screen.getByRole("button", { name: "CHF" })
    expect(button.firstChild?.textContent).toBe("CHF")
    expect(button.className).not.toContain("flex-row-reverse")
  })
})
