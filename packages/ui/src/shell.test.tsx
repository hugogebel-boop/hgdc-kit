// @vitest-environment happy-dom
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AccountMenu } from "./account-menu.tsx"
import { AppShell, SidebarNav, SidebarNavItem, toggleSidebar } from "./app-shell.tsx"
import { CommandMenu, matchCommand } from "./command-menu.tsx"
import { OrgSwitcher } from "./org-switcher.tsx"

afterEach(cleanup)

describe("matchCommand", () => {
  it("trouve sans accents ni casse, par libellé ou mot-clé", () => {
    const command = { label: "Créer un domaine", keywords: ["dns"] }
    expect(matchCommand(command, "creer dom")).toBe(true)
    expect(matchCommand(command, "DNS")).toBe(true)
    expect(matchCommand(command, "projet")).toBe(false)
    expect(matchCommand(command, "  ")).toBe(true)
  })
})

describe("CommandMenu", () => {
  const groups = (onSelect: () => void) => [
    {
      label: "Aller à",
      items: [
        { id: "projects", label: "Projets", onSelect },
        { id: "domains", label: "Domaines", keywords: ["dns"], onSelect },
      ],
    },
    { label: "Créer", items: [{ id: "new-key", label: "Créer une clé d'API", onSelect }] },
  ]

  it("s'ouvre à Ctrl+K, filtre et lance la commande choisie", async () => {
    const onSelect = vi.fn<() => void>()
    render(<CommandMenu groups={groups(onSelect)} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    })
    expect(await screen.findByRole("dialog", { name: "Palette de commandes" })).toBeDefined()
    const input = screen.getByRole("combobox", { name: "Rechercher une commande" })
    fireEvent.change(input, { target: { value: "dns" } })
    const options = await screen.findAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual(["Domaines"])
    fireEvent.click(options[0] as HTMLElement)
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it("dit quand rien ne correspond", async () => {
    render(<CommandMenu open groups={groups(() => {})} />)
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "zzz" } })
    expect(await screen.findByText("Aucune commande ne correspond.")).toBeDefined()
  })
})

describe("AppShell", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.sidebar
    localStorage.clear()
  })

  it("marque la page ouverte et mémorise le rail", () => {
    render(
      <AppShell
        nav={
          <SidebarNav label="Projet">
            <SidebarNavItem icon={DashboardSquare01Icon} label="Vue d'ensemble" href="/" active />
            <SidebarNavItem icon={DashboardSquare01Icon} label="Domaines" href="/domaines" />
          </SidebarNav>
        }
      >
        Page
      </AppShell>,
    )
    expect(screen.getByRole("link", { name: "Vue d'ensemble" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("main").textContent).toBe("Page")
    expect(screen.getByRole("link", { name: "Aller au contenu" }).getAttribute("href")).toBe("#contenu")

    fireEvent.click(screen.getByRole("button", { name: "Réduire la barre latérale" }))
    expect(document.documentElement.dataset.sidebar).toBe("rail")
    expect(localStorage.getItem("sidebar")).toBe("rail")
    expect(screen.getByRole("button", { name: "Déplier la barre latérale" })).toBeDefined()
    act(() => toggleSidebar())
    expect(document.documentElement.dataset.sidebar).toBeUndefined()
  })

  it("réduit la barre à Ctrl+B, sauf dans un champ", () => {
    render(
      <AppShell nav={null}>
        <input aria-label="Nom" />
      </AppShell>,
    )
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Nom" }), { key: "b", ctrlKey: true })
    expect(document.documentElement.dataset.sidebar).toBeUndefined()
    act(() => {
      fireEvent.keyDown(document, { key: "b", ctrlKey: true })
    })
    expect(document.documentElement.dataset.sidebar).toBe("rail")
  })
})

describe("OrgSwitcher", () => {
  it("montre l'organisation active et passe le choix au produit", async () => {
    const onSelect = vi.fn<(id: string) => void>()
    render(
      <OrgSwitcher
        organizations={[
          { id: "a", name: "Acme", role: "owner" },
          { id: "b", name: "Beta", role: "member" },
        ]}
        activeId="a"
        onSelect={onSelect}
        createHref="/nouvelle-organisation"
      />,
    )
    const trigger = screen.getByRole("button", { name: "Organisation Acme, changer d'organisation" })
    expect(trigger.textContent).toContain("Propriétaire")
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("menuitem", { name: /Beta/ }))
    expect(onSelect).toHaveBeenCalledWith("b")
  })

  it("propose de créer une organisation par un lien", async () => {
    render(
      <OrgSwitcher organizations={[{ id: "a", name: "Acme" }]} activeId="a" onSelect={() => {}} createHref="/new" />,
    )
    fireEvent.click(screen.getByRole("button"))
    const create = await screen.findByRole("menuitem", { name: "Créer une organisation" })
    expect(create.getAttribute("href")).toBe("/new")
  })
})

describe("AccountMenu", () => {
  it("donne accès au profil, aux autres produits et à la déconnexion", async () => {
    const onSignOut = vi.fn<() => void>()
    render(
      <AccountMenu
        user={{ name: "Hugo Gebel", email: "hugo@example.ch" }}
        onProfile={() => {}}
        onSignOut={onSignOut}
        products={[
          { name: "HGDC Host", href: "https://host.example", current: true },
          { name: "HGDC Mail", href: "https://mail.example" },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    expect(await screen.findByRole("menuitem", { name: "Profil" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "HGDC Mail" }).getAttribute("href")).toBe("https://mail.example")
    fireEvent.click(screen.getByRole("menuitem", { name: "Se déconnecter" }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
