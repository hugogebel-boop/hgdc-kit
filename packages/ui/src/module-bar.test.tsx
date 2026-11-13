// @vitest-environment happy-dom
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AccountMenu } from "./account-menu.tsx"
import { AppShell, SidebarNav, SidebarNavItem } from "./app-shell.tsx"
import { MODULE_BAR_KEY } from "./module-bar-store.ts"
import { currentSessionBase, sessionBases } from "./module-bar.tsx"
import type { ShellProductEntry } from "./products.ts"
import type { FamilyProduct } from "./family-svg.ts"

beforeEach(() => {
  // Le bandeau d'état lit la page de statut : jamais de réseau ici.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("hors ligne"))),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const nav = (
  <SidebarNav label="Projet">
    <SidebarNavItem icon={DashboardSquare01Icon} label="Domaines" href="/domaines" active />
  </SidebarNav>
)

function shell(product: FamilyProduct = "mail"): void {
  render(
    <AppShell product={product} organization={null} nav={nav}>
      Page
    </AppShell>,
  )
}

const aside = () => within(screen.getByRole("complementary", { name: "Barre latérale" }))
const back = () => fireEvent.click(aside().getByRole("button", { name: "Retour aux modules" }))
const moduleNames = () =>
  within(aside().getByRole("navigation", { name: "Modules" }))
    .getAllByRole("link")
    .map((link) => link.textContent)
const customize = () => {
  back()
  fireEvent.click(aside().getByRole("button", { name: "Personnaliser la barre" }))
}
const press = (name: string) => fireEvent.click(aside().getByRole("button", { name }))
const stored = () => JSON.parse(localStorage.getItem(MODULE_BAR_KEY) ?? "null") as unknown

describe("clic sur le module ouvert", () => {
  it("rend ses onglets sans quitter la page", () => {
    render(
      <AppShell
        product="mail"
        nav={
          <SidebarNav label="E-mails">
            <SidebarNavItem icon={DashboardSquare01Icon} label="Envois" href="/envois" />
          </SidebarNav>
        }
      >
        page
      </AppShell>,
    )
    const sidebar = screen.getByRole("complementary", { name: "Barre latérale" })
    fireEvent.click(within(sidebar).getByText("Retour aux modules"))
    fireEvent.click(within(sidebar).getByRole("link", { name: "E-mails" }))
    expect(within(sidebar).getByRole("link", { name: "Envois" })).toBeTruthy()
  })
})

describe("barre de Basalte, niveau des onglets", () => {
  it("dans l'ordre : organisation, Manager, retour, nom du module, navigation du produit", () => {
    const { container } = render(
      <AppShell product="mail" nav={nav} accountHref="http://localhost:3000">
        Page
      </AppShell>,
    )
    expect(container.querySelector("[data-slot=app-shell]")?.hasAttribute("data-module-bar")).toBe(true)
    expect(aside().getByRole("link", { name: "Manager" }).getAttribute("href")).toBe("http://localhost:3000")
    expect(container.querySelector("[data-slot=shell-module-title]")?.textContent).toBe("E-mails")
    const text = screen.getByRole("complementary", { name: "Barre latérale" }).textContent ?? ""
    const positions = ["Manager", "Retour aux modules", "E-mails", "Domaines"].map((label) => text.indexOf(label))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(aside().queryByRole("navigation", { name: "Modules" })).toBeNull()
  })
})

describe("barre de Basalte, liste des modules", () => {
  it("le retour remplace les onglets par la liste, sans changer de page", () => {
    shell()
    back()
    expect(aside().queryByRole("link", { name: "Domaines" })).toBeNull()
    expect(moduleNames()).toEqual(["Déploiements", "E-mails", "Surveillance", "Statistiques"])
    expect(screen.getByRole("main").textContent).toBe("Page")
  })

  it("seul le module ouvert porte `aria-current`, les autres mènent à leur entrée", () => {
    shell()
    back()
    const modules = within(aside().getByRole("navigation", { name: "Modules" }))
    expect(modules.getByRole("link", { name: "E-mails" }).getAttribute("aria-current")).toBe("page")
    const host = modules.getByRole("link", { name: "Déploiements" })
    expect(host.getAttribute("aria-current")).toBeNull()
    expect(host.getAttribute("href")).toBe("https://app.hgdc.ch/host/auth/hgdc?refresh=background&next=/")
  })

  it("un module ouvert mais masqué s'ajoute à la liste, sans changer le réglage", () => {
    shell("docs")
    back()
    expect(moduleNames()).toEqual(["Déploiements", "E-mails", "Surveillance", "Statistiques", "Documentation"])
    expect(aside().getByRole("link", { name: "Documentation" }).getAttribute("aria-current")).toBe("page")
    expect(stored()).toBeNull()
  })

  it("suit l'ordre retenu ; un stockage illisible rend l'ordre par défaut", () => {
    localStorage.setItem(MODULE_BAR_KEY, JSON.stringify(["analytics", "mail"]))
    const { unmount } = render(
      <AppShell product="mail" organization={null} nav={nav}>
        Page
      </AppShell>,
    )
    back()
    expect(moduleNames()).toEqual(["Statistiques", "E-mails"])
    unmount()
    localStorage.setItem(MODULE_BAR_KEY, "{pas du json")
    shell()
    back()
    expect(moduleNames()).toEqual(["Déploiements", "E-mails", "Surveillance", "Statistiques"])
  })
})

describe("barre de Basalte, personnalisation", () => {
  it("monter un module puis valider : enregistré, retour à la liste", () => {
    shell()
    customize()
    expect(aside().getByRole("button", { name: "Monter Déploiements" }).hasAttribute("disabled")).toBe(true)
    expect(aside().getByRole("button", { name: "Descendre Statistiques" }).hasAttribute("disabled")).toBe(true)
    press("Monter E-mails")
    expect(stored()).toBeNull()
    press("Valider")
    expect(stored()).toEqual(["mail", "host", "status", "analytics"])
    expect(moduleNames()).toEqual(["E-mails", "Déploiements", "Surveillance", "Statistiques"])
  })

  it("descendre, masquer et ajouter passent par le brouillon", () => {
    shell()
    customize()
    press("Descendre Déploiements")
    press("Masquer Statistiques")
    expect(aside().getByRole("button", { name: "Ajouter Statistiques" })).toBeDefined()
    press("Ajouter Documentation")
    expect(aside().queryByRole("button", { name: "Ajouter Documentation" })).toBeNull()
    press("Valider")
    expect(stored()).toEqual(["mail", "host", "status", "docs"])
  })

  it("Annuler oublie le brouillon, et il ne revient pas à la réouverture", () => {
    shell()
    customize()
    press("Masquer Déploiements")
    press("Annuler")
    expect(stored()).toBeNull()
    expect(moduleNames()).toEqual(["Déploiements", "E-mails", "Surveillance", "Statistiques"])
    press("Personnaliser la barre")
    expect(aside().getByRole("button", { name: "Masquer Déploiements" })).toBeDefined()
  })

  it("masquer le module ouvert : retenu masqué, mais toujours montré tant qu'il est ouvert", () => {
    shell()
    customize()
    press("Masquer E-mails")
    press("Valider")
    expect(stored()).toEqual(["host", "status", "analytics"])
    expect(moduleNames()).toEqual(["Déploiements", "Surveillance", "Statistiques", "E-mails"])
  })
})

describe("barre de Basalte, menu du compte", () => {
  const account = <AccountMenu user={{ name: "Hugo Gebel", email: "hugo@example.ch" }} onSignOut={() => {}} />
  const links = { documentation: "https://docs.example", settings: "/reglages" }

  it("Réglages reste au-dessus du compte ; Documentation, État du service et l'autre vue passent au menu, sans les produits", async () => {
    render(
      <AppShell
        product="mail"
        view="app"
        nav={null}
        links={links}
        statusPage="https://status.example"
        account={account}
      >
        Page
      </AppShell>,
    )
    const common = aside().getByRole("navigation", { name: "Accès communs" })
    expect(
      within(common)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Réglages"])
    fireEvent.click(aside().getByRole("button", { name: "Compte de Hugo Gebel" }))
    expect((await screen.findByRole("menuitem", { name: "Documentation" })).getAttribute("href")).toBe(
      "https://docs.example",
    )
    expect(screen.getByRole("menuitem", { name: "État du service" }).getAttribute("href")).toBe(
      "https://status.example",
    )
    expect(screen.getByRole("menuitem", { name: "Ouvrir seul" })).toBeDefined()
    expect(screen.queryByText("Produits")).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "Manager" })).toBeNull()
  })

  it("`status: false` retire l'entrée du menu", async () => {
    render(
      <AppShell product="mail" nav={null} links={{ status: false }} account={account}>
        Page
      </AppShell>,
    )
    fireEvent.click(aside().getByRole("button", { name: "Compte de Hugo Gebel" }))
    await screen.findByRole("menuitem", { name: "Se déconnecter" })
    expect(screen.queryByRole("menuitem", { name: "État du service" })).toBeNull()
  })

  it("sans barre : les trois accès au-dessus du compte, « Produits » dans son menu", async () => {
    render(
      <AppShell product="mail" productRail={false} nav={null} links={links} account={account}>
        Page
      </AppShell>,
    )
    const common = aside().getByRole("navigation", { name: "Accès communs" })
    expect(
      within(common)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Documentation", "Réglages", "État du service"])
    fireEvent.click(aside().getByRole("button", { name: "Compte de Hugo Gebel" }))
    await screen.findByRole("menuitem", { name: "Manager" })
    expect(screen.getByText("Produits")).toBeDefined()
    // « Documentation » ici est le module du catalogue, pas l'aide du produit restée au-dessus du compte.
    expect(screen.getByRole("menuitem", { name: "Documentation" }).getAttribute("href")).not.toBe(
      "https://docs.example",
    )
  })
})

describe("barre de Basalte, tiroir sur téléphone", () => {
  async function openDrawer(): Promise<ReturnType<typeof within>> {
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }))
    return within(await screen.findByRole("dialog", { name: "Menu" }))
  }

  it("le retour et la personnalisation gardent le tiroir ouvert", async () => {
    shell()
    const drawer = await openDrawer()
    fireEvent.click(drawer.getByRole("button", { name: "Retour aux modules" }))
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeDefined()
    expect(drawer.getByRole("navigation", { name: "Modules" })).toBeDefined()
    fireEvent.click(drawer.getByRole("button", { name: "Personnaliser la barre" }))
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeDefined()
    expect(drawer.getByRole("group", { name: "Personnaliser la barre" })).toBeDefined()
  })

  it("un onglet referme le tiroir", async () => {
    shell()
    const drawer = await openDrawer()
    fireEvent.click(drawer.getByRole("link", { name: "Domaines" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull())
  })
})

describe("sessions ouvertes en arrière-plan (ADR 0026)", () => {
  const entry = (badge: FamilyProduct, href: string, sameOrigin = true): ShellProductEntry => ({
    name: badge,
    badge,
    href,
    ...(sameOrigin ? { sameOrigin } : {}),
  })
  const entries = [
    entry("host", "/host/"),
    entry("mail", "/mail/auth/hgdc?refresh=background&next=%2Fo%2Facme"),
    entry("status", "/status/auth/hgdc?refresh=background&next=%2F"),
    entry("analytics", "https://analytics.hgdc.ch/auth/hgdc?refresh=background", false),
  ]

  it("les modules affichés de la même origine, sans le module ouvert", () => {
    expect(sessionBases(entries, ["host", "mail", "status", "analytics"], "host")).toEqual(["/mail", "/status"])
  })

  it("un module masqué ou absent du projet n'ouvre rien", () => {
    expect(sessionBases(entries, ["host", "status"], "host")).toEqual(["/status"])
  })

  it("base du module ouvert : sous sa base seulement", () => {
    expect(currentSessionBase([{ ...entry("host", "/host/"), current: true }, ...entries.slice(1)])).toBe("/host")
    // Rendu serveur ou autre origine : l'entrée du module ouvert mène à « / ».
    expect(currentSessionBase([{ ...entry("host", "/"), current: true }])).toBeNull()
    expect(currentSessionBase(entries)).toBeNull()
  })
})
