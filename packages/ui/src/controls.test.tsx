// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Alert } from "./alert.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx"
import { Checkbox } from "./checkbox.tsx"
import { Breadcrumbs, PageHeader } from "./page-header.tsx"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover.tsx"
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx"
import { SecretReveal } from "./secret-reveal.tsx"
import { Pending, Skeleton } from "./skeleton.tsx"
import { Tabs, TabsList, TabsPanel, TabsTab } from "./tabs.tsx"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Card", () => {
  it("est une surface teintée, sans ombre ni contour", () => {
    render(
      <Card aria-label="Domaines">
        <CardHeader>
          <CardTitle>Domaines</CardTitle>
        </CardHeader>
        <CardContent>Contenu</CardContent>
      </Card>,
    )
    const card = screen.getByRole("region", { name: "Domaines" })
    expect(card.className).toContain("surface")
    expect(card.className).not.toMatch(/shadow|(^|\s)border(\s|$)/)
    expect(screen.getByRole("heading", { name: "Domaines" })).toBeDefined()
  })

  it("devient un lien entier sans perdre sa sémantique", () => {
    render(
      <Card interactive render={<a href="/projets/site" />}>
        Site vitrine
      </Card>,
    )
    const link = screen.getByRole("link", { name: "Site vitrine" })
    expect(link.className).toContain("surface-link")
    expect(link.className).not.toMatch(/hover:scale/)
  })
})

describe("PageHeader", () => {
  it("rend un titre de niveau 1, le fil d'Ariane et marque la page courante", () => {
    render(
      <PageHeader
        title="Déploiements"
        breadcrumbs={[
          { label: "Acme", href: "/acme" },
          { label: "Site", href: "/acme/site" },
          { label: "Déploiements" },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { level: 1, name: "Déploiements" })).toBeDefined()
    const nav = screen.getByRole("navigation", { name: "Fil d'Ariane" })
    expect(nav.querySelectorAll("a")).toHaveLength(2)
    expect(nav.querySelector("[aria-current=page]")?.textContent).toBe("Déploiements")
  })

  it("accepte le lien du routeur du produit", () => {
    render(
      <Breadcrumbs
        items={[
          {
            label: "Acme",
            render: (
              <a href="/o/acme" data-router>
                Acme
              </a>
            ),
          },
          { label: "Membres" },
        ]}
      />,
    )
    expect(screen.getByRole("link", { name: "Acme" }).hasAttribute("data-router")).toBe(true)
  })
})

describe("Alert", () => {
  it("annonce une erreur tout de suite, le reste poliment", () => {
    render(
      <>
        <Alert tone="destructive" title="Échec du déploiement" />
        <Alert tone="info" title="Nouveau domaine" />
      </>,
    )
    expect(screen.getByRole("alert").textContent).toContain("Échec du déploiement")
    expect(screen.getByRole("status").textContent).toContain("Nouveau domaine")
  })

  it("porte toujours une icône, la couleur ne dit jamais seule le ton", () => {
    render(<Alert tone="warning" title="Quota presque atteint" />)
    expect(screen.getByRole("status").querySelector("svg")).not.toBeNull()
  })
})

describe("Checkbox", () => {
  it("se coche par son label, qui la nomme", () => {
    const onChange = vi.fn<(checked: boolean, details: unknown) => void>()
    render(
      <label>
        <Checkbox onCheckedChange={onChange} /> Recevoir le résumé
      </label>,
    )
    const box = screen.getByRole("checkbox", { name: "Recevoir le résumé" })
    expect(box.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(screen.getByText("Recevoir le résumé"))
    expect(box.getAttribute("aria-checked")).toBe("true")
    expect(onChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it("dit l'état mixte", () => {
    render(<Checkbox aria-label="Tout sélectionner" indeterminate />)
    expect(screen.getByRole("checkbox", { name: "Tout sélectionner" }).getAttribute("aria-checked")).toBe("mixed")
  })
})

describe("RadioGroup", () => {
  it("ne garde qu'un choix et le change au clic", () => {
    render(
      <RadioGroup aria-label="Rôle" defaultValue="member">
        <RadioGroupItem value="admin" aria-label="Admin" />
        <RadioGroupItem value="member" aria-label="Membre" />
      </RadioGroup>,
    )
    expect(screen.getByRole("radiogroup", { name: "Rôle" })).toBeDefined()
    const admin = screen.getByRole("radio", { name: "Admin" })
    const member = screen.getByRole("radio", { name: "Membre" })
    expect(member.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(admin)
    expect(admin.getAttribute("aria-checked")).toBe("true")
    expect(member.getAttribute("aria-checked")).toBe("false")
  })
})

describe("Tabs", () => {
  it("garde un seul onglet dans l'ordre de tabulation et montre son panneau", () => {
    render(
      <Tabs defaultValue="apercu">
        <TabsList aria-label="Sections">
          <TabsTab value="apercu">Aperçu</TabsTab>
          <TabsTab value="journal">Journal</TabsTab>
        </TabsList>
        <TabsPanel value="apercu">Résumé</TabsPanel>
        <TabsPanel value="journal">Événements</TabsPanel>
      </Tabs>,
    )
    const first = screen.getByRole("tab", { name: "Aperçu" })
    const second = screen.getByRole("tab", { name: "Journal" })
    expect(first.getAttribute("aria-selected")).toBe("true")
    // Navigation en tabulation itinérante : les flèches passent d'un onglet à l'autre.
    expect(first.tabIndex).toBe(0)
    expect(second.tabIndex).toBe(-1)
    fireEvent.click(second)
    expect(second.getAttribute("aria-selected")).toBe("true")
    const panels = screen.getAllByRole("tabpanel", { hidden: true })
    // Le panneau quitté sort (inerte, le temps de sa transition), le nouveau est relié à son onglet.
    const shown = panels.filter((p) => !p.hasAttribute("inert"))
    expect(shown.map((p) => p.textContent)).toEqual(["Événements"])
    expect(shown[0]?.getAttribute("aria-labelledby")).toBe(second.id)
  })
})

describe("Popover", () => {
  it("s'ouvre au clic et se ferme à Échap", async () => {
    render(
      <Popover>
        <PopoverTrigger>Aide</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Domaine vérifié</PopoverTitle>
        </PopoverContent>
      </Popover>,
    )
    const trigger = screen.getByRole("button", { name: "Aide" })
    fireEvent.click(trigger)
    expect(await screen.findByRole("dialog")).toBeDefined()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
})

describe("Pending", () => {
  it("ne montre rien pendant le délai, puis le squelette au moins le temps minimal", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <Pending pending fallback={<Skeleton data-testid="squelette" />}>
        Contenu
      </Pending>,
    )
    expect(screen.queryByTestId("squelette")).toBeNull()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByTestId("squelette")).toBeDefined()
    expect(screen.getByRole("status").textContent).toBe("Chargement")

    rerender(
      <Pending pending={false} fallback={<Skeleton data-testid="squelette" />}>
        Contenu
      </Pending>,
    )
    // Arrivé 50 ms après son apparition : le squelette tient encore.
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByTestId("squelette")).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByTestId("squelette")).toBeNull()
    expect(screen.getByText("Contenu")).toBeDefined()
  })

  it("passe directement au contenu quand la réponse est rapide", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <Pending pending fallback={<Skeleton data-testid="squelette" />}>
        Contenu
      </Pending>,
    )
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender(
      <Pending pending={false} fallback={<Skeleton data-testid="squelette" />}>
        Contenu
      </Pending>,
    )
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByTestId("squelette")).toBeNull()
    expect(screen.getByText("Contenu")).toBeDefined()
  })
})

describe("SecretReveal", () => {
  it("masque la valeur, l'affiche sur demande, puis la retire de la page", () => {
    const onDismiss = vi.fn<() => void>()
    render(<SecretReveal label="Clé d'API" value="sk_live_123" onDismiss={onDismiss} />)
    expect(screen.queryByText("sk_live_123")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Afficher" }))
    expect(screen.getByText("sk_live_123")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "C'est copié" }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain("sk_live_123")
  })
})
