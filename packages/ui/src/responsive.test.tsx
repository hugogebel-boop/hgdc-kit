// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SidebarNav, SidebarNavItem } from "./app-shell.tsx"
import { Board, edgeScrollSpeed } from "./board.tsx"
import { Breadcrumbs } from "./page-header.tsx"
import { Input } from "./input.tsx"
import { ResourceItem, ResourceList } from "./resource-list.tsx"
import { Select, SelectTrigger, SelectValue } from "./select.tsx"
import { Switch } from "./switch.tsx"
import { Tabs, TabsList, TabsTab } from "./tabs.tsx"
import { Textarea } from "./textarea.tsx"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const css = readFileSync(join(import.meta.dirname, "../styles.css"), "utf8")

/** Corps d'un `@utility`, jusqu'à l'accolade fermante en début de ligne. */
function utility(name: string): string {
  const start = css.indexOf(`@utility ${name} {`)
  expect(start, `@utility ${name} introuvable`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf("\n}", start))
}

describe("cibles tactiles : le pointeur décide, pas la largeur", () => {
  it("`touch-target` et `touch-field` valent pour tout pointeur grossier, survol annoncé ou non", () => {
    for (const name of ["touch-target", "touch-field"]) {
      const body = utility(name)
      expect(body).toContain("@media (pointer: coarse)")
      expect(body).not.toContain("hover")
      expect(body).not.toMatch(/@media[^{]*width/)
    }
    expect(css).toContain("@custom-variant coarse (@media (pointer: coarse));")
  })

  it("une entrée de navigation garde 44 px au doigt, même là où `lg:` la resserre", () => {
    render(
      <SidebarNav label="Projet">
        <SidebarNavItem icon={[]} label="Déploiements" href="/d" />
      </SidebarNav>,
    )
    const link = screen.getByRole("link", { name: "Déploiements" })
    expect(link.className).toContain("min-h-11")
    expect(link.className).toContain("lg:min-h-9")
    expect(link.className).toContain("coarse:min-h-11")
  })

  it("interrupteur, fil d'Ariane : zone tactile élargie", () => {
    render(
      <>
        <Switch aria-label="Notifications" />
        <Breadcrumbs items={[{ label: "Moniteurs", href: "/m" }, { label: "API" }]} />
      </>,
    )
    expect(screen.getByRole("switch", { name: "Notifications" }).className).toContain("touch-target")
    expect(screen.getByRole("link", { name: "Moniteurs" }).className).toContain("touch-target")
  })
})

describe("champs", () => {
  it("16 px à toutes les largeurs (pas de zoom au focus sur iPad) et filet à 3:1", () => {
    render(
      <>
        <Input aria-label="Nom" />
        <Textarea aria-label="Message" />
        <Select>
          <SelectTrigger aria-label="Rôle">
            <SelectValue />
          </SelectTrigger>
        </Select>
      </>,
    )
    for (const field of [
      screen.getByRole("textbox", { name: "Nom" }),
      screen.getByRole("textbox", { name: "Message" }),
      screen.getByRole("combobox", { name: "Rôle" }),
    ]) {
      expect(field.className).toContain("text-base")
      // `file:text-sm` habille le bouton d'un champ fichier, pas la saisie.
      expect(field.className).not.toMatch(/(?:^|\s)(?!file:)[\w-]+:text-sm/)
      expect(field.className).toContain("ring-control-off")
    }
  })
})

describe("ResourceItem sur écran étroit", () => {
  it("badge et actions forment un bloc qui passe sous le titre, la méta tient sur deux lignes", () => {
    render(
      <ResourceList aria-label="Signatures">
        <ResourceItem
          title="Avenant de test"
          meta="Demandé le 18 octobre 2026 · Organisation de test"
          badge={<span>À signer</span>}
          actions={<button type="button">Lire et signer</button>}
        />
      </ResourceList>,
    )
    const trailing = document.querySelector("[data-slot=resource-item-trailing]")
    expect(trailing?.textContent).toBe("À signerLire et signer")
    // Le bloc de texte réclame sa largeur ; la rangée passe à la ligne plutôt que de l'écraser.
    const row = trailing?.parentElement
    expect(row?.className).toContain("flex-wrap")
    expect(row?.firstElementChild?.className).toContain("flex-[1_1_12rem]")
    expect(screen.getByText(/Demandé le/).className).toContain("line-clamp-2")
  })
})

describe("Tabs défilants", () => {
  it("marque le bord où il reste des onglets cachés", () => {
    const sizes = { scrollWidth: 600, clientWidth: 300 }
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => sizes.scrollWidth)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => sizes.clientWidth)
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections">
          <TabsTab value="a">Étapes</TabsTab>
          <TabsTab value="b">Tableau</TabsTab>
        </TabsList>
      </Tabs>,
    )
    const list = screen.getByRole("tablist")
    expect(list.className).toContain("scroll-fade-x")
    expect(list.hasAttribute("data-overflow-end")).toBe(true)
    expect(list.hasAttribute("data-overflow-start")).toBe(false)
    list.scrollLeft = 300
    fireEvent.scroll(list)
    expect(list.hasAttribute("data-overflow-start")).toBe(true)
    expect(list.hasAttribute("data-overflow-end")).toBe(false)
  })
})

describe("Board : défilement automatique", () => {
  it("vitesse nulle au centre, croissante vers chaque bord, rognée à l'écran", () => {
    const rect = { left: 0, right: 400 }
    expect(edgeScrollSpeed(200, rect, 400)).toBe(0)
    expect(edgeScrollSpeed(390, rect, 400)).toBeGreaterThan(edgeScrollSpeed(360, rect, 400))
    expect(edgeScrollSpeed(360, rect, 400)).toBeGreaterThan(0)
    expect(edgeScrollSpeed(5, rect, 400)).toBeLessThan(0)
    // Tableau plus large que l'écran : le bord qui compte est celui de l'écran.
    expect(edgeScrollSpeed(385, { left: 0, right: 1200 }, 390)).toBeGreaterThan(0)
    expect(edgeScrollSpeed(10, { left: 0, right: 0 }, 390)).toBe(0)
  })

  it("une carte tenue près du bord droit fait défiler le tableau", () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal("cancelAnimationFrame", () => {})
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
    render(
      <Board
        label="Tableau du projet"
        columns={[
          { id: "todo", label: "À faire", title: "À faire", cards: [{ id: "a" }] },
          { id: "doing", label: "En cours", title: "En cours", cards: [] },
          { id: "done", label: "Fait", title: "Fait", cards: [] },
        ]}
        cardKey={(card) => card.id}
        cardLabel={() => "Maquette"}
        renderCard={(_, { handle }) => <span>{handle}Maquette</span>}
        onMove={() => {}}
      />,
    )
    const region = screen.getByRole("region", { name: "Tableau du projet" })
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 400))
    const handle = screen.getByRole("button", { name: "Déplacer Maquette" })
    handle.setPointerCapture = () => {}
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 385, clientY: 100 })
    expect(region.className).toContain("snap-none")
    expect(frames.length).toBeGreaterThan(0)
    act(() => frames.shift()?.(0))
    expect(region.scrollLeft).toBeGreaterThan(0)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 385, clientY: 100 })
  })
})
