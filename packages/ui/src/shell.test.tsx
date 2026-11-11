// @vitest-environment happy-dom
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AccountMenu } from "./account-menu.tsx"
import {
  AppShell,
  PRODUCT_LEAVE_DELAY_MS,
  SidebarNav,
  SidebarNavBack,
  SidebarNavGroup,
  SidebarNavItem,
  toggleSidebar,
} from "./app-shell.tsx"
import { Avatar, AvatarFallback } from "./avatar.tsx"
import { avatarTone, orgTone } from "./initials.ts"
import { CommandMenu, matchCommand } from "./command-menu.tsx"
import { OrgSwitcher } from "./org-switcher.tsx"
import { FamilyLoaderRoot } from "./family-loader.tsx"
import { PagePending, routerPendingDefaults, shellNavigation } from "./page-pending.tsx"
import { SHELL_ORG_KEY } from "./shell-memory.ts"
import { ThemeProvider } from "./theme.tsx"

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
  // Mémoire de la coque (ADR 0020) : un test ne reprend pas l'organisation d'un autre.
  localStorage.clear()
})

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

  const nav = (
    <SidebarNav label="Projet">
      <SidebarNavItem icon={DashboardSquare01Icon} label="Vue d'ensemble" href="/" active />
      <SidebarNavItem icon={DashboardSquare01Icon} label="Domaines" href="/domaines" />
    </SidebarNav>
  )

  it("marque la page ouverte et mémorise le rail", () => {
    render(
      <AppShell product="host" nav={nav}>
        Page
      </AppShell>,
    )
    expect(screen.getByRole("link", { name: "Vue d'ensemble" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("main").textContent).toBe("Page")
    expect(screen.getByRole("link", { name: "Aller au contenu" }).getAttribute("href")).toBe("#contenu")

    fireEvent.click(screen.getByRole("button", { name: "Réduire la barre latérale" }))
    expect(document.documentElement.dataset.sidebar).toBe("rail")
    expect(localStorage.getItem("sidebar")).toBe("rail")
    fireEvent.click(screen.getByRole("button", { name: "Déplier la barre latérale" }))
    expect(document.documentElement.dataset.sidebar).toBeUndefined()
    act(() => toggleSidebar())
    expect(document.documentElement.dataset.sidebar).toBe("rail")
  })

  it("imbrique une navigation : retour en tête, groupes titrés", () => {
    render(
      <AppShell
        product="status"
        nav={
          <SidebarNav label="Page">
            <SidebarNavBack label="Retour aux pages" href="/pages" />
            <SidebarNavItem icon={DashboardSquare01Icon} label="Vue d'ensemble" href="/p" active />
            <SidebarNavGroup label="Réglages">
              <SidebarNavItem icon={DashboardSquare01Icon} label="Apparence" href="/p/apparence" />
            </SidebarNavGroup>
          </SidebarNav>
        }
      >
        Page
      </AppShell>,
    )
    const back = screen.getByRole("link", { name: "Retour aux pages" })
    expect(back.getAttribute("href")).toBe("/pages")
    expect(back.getAttribute("aria-current")).toBeNull()
    const nav = screen.getByRole("navigation", { name: "Page" })
    // Le retour est la première entrée de la navigation.
    expect(nav.querySelector("li a")).toBe(back)
    const group = within(nav).getByRole("list", { name: "Réglages" })
    expect(within(group).getByRole("link", { name: "Apparence" }).getAttribute("href")).toBe("/p/apparence")
  })

  describe("groupe repliable", () => {
    beforeEach(() => localStorage.clear())

    const pageNav = (props: { active?: boolean; current?: boolean } = {}) => (
      <SidebarNav label="Page">
        <SidebarNavGroup label="Réglages" collapsible icon={DashboardSquare01Icon} active={props.active}>
          <SidebarNavItem
            icon={DashboardSquare01Icon}
            label="Apparence"
            href="/p/apparence"
            active={props.current ?? false}
          />
        </SidebarNavGroup>
      </SidebarNav>
    )

    const disclosure = () => screen.getAllByRole("button", { name: "Réglages" })[0]!

    it("se ferme par défaut et se déroule au clic, mémorisé", () => {
      render(
        <AppShell product="status" nav={pageNav()}>
          Page
        </AppShell>,
      )
      const button = disclosure()
      expect(button.getAttribute("aria-expanded")).toBe("false")
      const list = document.getElementById(button.getAttribute("aria-controls") ?? "")
      expect(list?.tagName).toBe("UL")
      expect(list?.getAttribute("aria-labelledby")).toBe(button.id)
      // Fermé : la liste ne se voit pas et sort de l'ordre de tabulation.
      expect(list?.parentElement?.className).toContain("invisible")
      // En rail, ses rubriques restent visibles.
      expect(list?.parentElement?.className).toContain("lg:rail:visible")
      expect(button.className).toContain("lg:rail:hidden")

      fireEvent.click(button)
      expect(button.getAttribute("aria-expanded")).toBe("true")
      expect(list?.parentElement?.className).toContain("grid-rows-[1fr]")
      expect(localStorage.getItem("sidebar-group:status:Réglages")).toBe("open")
      fireEvent.click(button)
      expect(button.getAttribute("aria-expanded")).toBe("false")
      expect(localStorage.getItem("sidebar-group:status:Réglages")).toBe("closed")
    })

    it("la clé est propre au produit : un groupe du même nom ailleurs ne la partage pas", () => {
      // Sous app.hgdc.ch, localStorage est commun à tous les produits.
      localStorage.setItem("sidebar-group:mail:Réglages", "open")
      render(
        <AppShell product="status" nav={pageNav()}>
          Page
        </AppShell>,
      )
      expect(disclosure().getAttribute("aria-expanded")).toBe("false")
    })

    it("reprend l'état mémorisé", () => {
      localStorage.setItem("sidebar-group:status:Réglages", "open")
      render(
        <AppShell product="status" nav={pageNav()}>
          Page
        </AppShell>,
      )
      expect(disclosure().getAttribute("aria-expanded")).toBe("true")
    })

    it("s'ouvre quand une rubrique est la page ouverte, même mémorisé fermé", () => {
      localStorage.setItem("sidebar-group:status:Réglages", "closed")
      render(
        <AppShell product="status" nav={pageNav({ current: true })}>
          Page
        </AppShell>,
      )
      expect(disclosure().getAttribute("aria-expanded")).toBe("true")
    })

    it("suit `active`, et se laisse refermer", () => {
      const { rerender } = render(
        <AppShell product="status" nav={pageNav({ active: false })}>
          Page
        </AppShell>,
      )
      expect(disclosure().getAttribute("aria-expanded")).toBe("false")
      rerender(
        <AppShell product="status" nav={pageNav({ active: true })}>
          Page
        </AppShell>,
      )
      expect(disclosure().getAttribute("aria-expanded")).toBe("true")
      fireEvent.click(disclosure())
      expect(disclosure().getAttribute("aria-expanded")).toBe("false")
    })

    it("garde le groupe titré sans `collapsible`", () => {
      render(
        <AppShell
          product="status"
          nav={
            <SidebarNav label="Page">
              <SidebarNavGroup label="Suivi">
                <SidebarNavItem icon={DashboardSquare01Icon} label="Moniteurs" href="/p/moniteurs" />
              </SidebarNavGroup>
            </SidebarNav>
          }
        >
          Page
        </AppShell>,
      )
      expect(screen.queryByRole("button", { name: "Suivi" })).toBeNull()
      expect(screen.getAllByRole("list", { name: "Suivi" }).length).toBeGreaterThan(0)
    })
  })

  it("garde le bouton Déplier à la place du logo, jamais dessous", () => {
    const { container } = render(
      <AppShell product="mail" productRail={false} nav={nav}>
        Page
      </AppShell>,
    )
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    const brand = container.querySelector("[data-slot=sidebar-brand]")
    expect(brand?.textContent).toBe("E-mails")
    const expand = screen.getByRole("button", { name: "Déplier la barre latérale" })
    // Le logo du produit est dans le bouton : en rail, il devient le bouton au survol.
    expect(expand.querySelector("img")).not.toBeNull()
    expect(expand.className).toContain("rail:grid")
    expect(expand.className).toContain("hidden")
    expect(screen.getByRole("button", { name: "Réduire la barre latérale" }).className).toContain("rail:hidden")
    // Même rangée que la marque, en tête de la barre.
    expect(expand.parentElement).toBe(brand?.parentElement)
    expect(aside.firstElementChild).toBe(expand.parentElement)
    // Même boîte qu'une entrée de navigation en rail : 40 × 36 px.
    expect(expand.className).toContain("h-9")
    expect(expand.className).toContain("w-10")
  })

  it("réduit la barre à Ctrl+B, sauf dans un champ", () => {
    render(
      <AppShell product="host" nav={null}>
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

describe("Barre de Basalte, organisation", () => {
  it("porte le sélecteur d'organisation en haut, avant Manager", () => {
    render(
      <AppShell
        product="status"
        organization={<OrgSwitcher organizations={[{ id: "a", name: "Acme" }]} activeId="a" onSelect={() => {}} />}
        nav={null}
      >
        Page
      </AppShell>,
    )
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    const head = aside.firstElementChild as HTMLElement
    expect(head.dataset.slot).toBe("shell-organization")
    expect(within(head).getByRole("button", { name: "Organisation Acme, changer d'organisation" })).toBeDefined()
    expect(within(head).getByRole("button", { name: "Réduire la barre latérale" })).toBeDefined()
  })

  it("organisation pas encore là : sa place tenue (marque retenue ou squelette) ; `null` : rien", () => {
    const { unmount } = render(
      <AppShell product="mail" nav={null}>
        Page
      </AppShell>,
    )
    const head = () => document.querySelector("[data-slot=shell-organization]")
    expect(head()?.querySelector("[data-slot=org-placeholder]")).not.toBeNull()
    expect(head()?.querySelector("[data-slot=org-placeholder-mark]")?.className).toContain("size-8")
    unmount()
    render(
      <AppShell product="mail" organization={null} nav={null}>
        Page
      </AppShell>,
    )
    expect(head()?.querySelector("[data-slot=org-placeholder]")).toBeNull()
  })

  it("l'organisation affichée est retenue pour la première image du produit suivant", () => {
    render(
      <AppShell
        product="host"
        organization={
          <OrgSwitcher organizations={[{ id: "a", name: "Atelier Gebel" }]} activeId="a" onSelect={() => {}} />
        }
        nav={null}
      >
        Page
      </AppShell>,
    )
    expect(JSON.parse(localStorage.getItem(SHELL_ORG_KEY) ?? "null")).toEqual({
      initials: "AG",
      tone: orgTone({ id: "a", name: "Atelier Gebel" }),
    })
    expect(document.documentElement.dataset.hgdcOrg).toBe("")
    expect(document.documentElement.dataset.hgdcProduct).toBe("host")
  })

  it("se coupe par `productRail={false}` : marque du produit, organisation dessous", () => {
    const { container } = render(
      <AppShell
        product="account"
        productRail={false}
        organization={<OrgSwitcher organizations={[{ id: "a", name: "Acme" }]} activeId="a" onSelect={() => {}} />}
        nav={null}
      >
        Page
      </AppShell>,
    )
    expect(container.querySelector("[data-slot=shell-navigation]")).toBeNull()
    expect(container.querySelector("[data-slot=sidebar-brand]")).not.toBeNull()
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    expect(within(aside).getByRole("button", { name: "Organisation Acme, changer d'organisation" })).toBeDefined()
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
          { name: "Host", href: "https://host.example", current: true },
          { name: "Mail", href: "https://mail.example" },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    expect(await screen.findByRole("menuitem", { name: "Profil" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Mail" }).getAttribute("href")).toBe("https://mail.example")
    fireEvent.click(screen.getByRole("menuitem", { name: "Se déconnecter" }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it("section Produits retirée dans la barre de Basalte, gardée sans barre", async () => {
    const menu = (
      <AccountMenu
        user={{ name: "Hugo Gebel", email: "hugo@example.ch" }}
        onSignOut={() => {}}
        products={[
          { name: "Host", href: "https://host.example", current: true },
          { name: "Mail", href: "https://mail.example" },
        ]}
      />
    )
    const open = () =>
      fireEvent.click(
        within(screen.getByRole("complementary", { name: "Barre latérale" })).getByRole("button", {
          name: "Compte de Hugo Gebel",
        }),
      )
    const { unmount } = render(
      <AppShell product="host" nav={null} sidebarFooter={menu}>
        Page
      </AppShell>,
    )
    open()
    await screen.findByRole("menuitem", { name: "Se déconnecter" })
    expect(screen.queryByRole("menuitem", { name: "Mail" })).toBeNull()
    expect(screen.queryByText("Produits")).toBeNull()
    unmount()

    render(
      <AppShell product="account" productRail={false} nav={null} sidebarFooter={menu}>
        Page
      </AppShell>,
    )
    open()
    expect(await screen.findByRole("menuitem", { name: "Mail" })).toBeDefined()
    expect(screen.getByText("Produits")).toBeDefined()
  })

  it("dans l'ordre : identité, Profil, Sécurité, Thème, puis Se déconnecter à part ; ni raccourcis, ni état du service", async () => {
    render(
      <AccountMenu
        user={{ name: "Hugo Gebel", email: "hugo@example.ch" }}
        onProfile={() => {}}
        onSecurity={() => {}}
        onShortcuts={() => {}}
        statusPage="https://status.example/host"
        onSignOut={() => {}}
        products={[]}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    const menu = await screen.findByRole("menu")
    const entries = [...menu.querySelectorAll('[role="menuitem"], [role="radiogroup"]')].map(
      (node) => node.getAttribute("aria-label") ?? node.textContent?.trim(),
    )
    expect(entries).toEqual(["Profil", "Sécurité", "Thème", "Se déconnecter"])
    expect(within(menu).getByText("hugo@example.ch")).toBeDefined()
    expect(screen.queryByRole("menuitem", { name: /Raccourcis/ })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "État du service" })).toBeNull()
  })
})

describe("AppShell sans barre, accès au-dessus du compte", () => {
  const account = (
    <AccountMenu user={{ name: "Hugo Gebel", email: "hugo@example.ch" }} onSignOut={() => {}} products={[]} />
  )

  it("Documentation, Réglages, État du service, dans cet ordre, juste au-dessus du compte", () => {
    render(
      <AppShell
        product="docs"
        productRail={false}
        nav={null}
        links={{ documentation: "https://docs.example/docs", settings: { href: "/reglages", active: true } }}
        account={account}
      >
        Page
      </AppShell>,
    )
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    const common = within(aside).getByRole("navigation", { name: "Accès communs" })
    const links = within(common).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual(["Documentation", "Réglages", "État du service"])
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://docs.example/docs",
      "/reglages",
      // La page de statut de la coque par défaut.
      "https://status.hgdc.ch/documentation",
    ])
    expect(links[1]?.getAttribute("aria-current")).toBe("page")
    // Le compte suit immédiatement les accès communs.
    const button = within(aside).getByRole("button", { name: "Compte de Hugo Gebel" })
    expect(common.nextElementSibling?.contains(button)).toBe(true)
  })

  it("chaque accès est optionnel : `status: false` le retire, `statusPage` le change", () => {
    const { unmount } = render(
      <AppShell
        product="host"
        productRail={false}
        nav={null}
        statusPage="https://status.example/host"
        account={account}
      >
        Page
      </AppShell>,
    )
    const aside = () => screen.getByRole("complementary", { name: "Barre latérale" })
    expect(
      within(aside())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["https://status.example/host"])
    unmount()
    render(
      <AppShell product="host" productRail={false} nav={null} links={{ status: false }} account={account}>
        Page
      </AppShell>,
    )
    expect(within(aside()).queryByRole("navigation", { name: "Accès communs" })).toBeNull()
  })

  it("`sidebarFooter` sans `account` (déprécié) : rendu tel quel, sous les accès communs", () => {
    render(
      <AppShell product="host" productRail={false} nav={null} sidebarFooter={<a href="/ancien">Ancien pied</a>}>
        Page
      </AppShell>,
    )
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    expect(
      within(aside)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["État du service", "Ancien pied"])
  })
})

describe("AppShell, vue seule et réglage « Barre des produits » (ADR 0014)", () => {
  afterEach(() => window.localStorage.clear())

  it("vue seule : pas de barre de Basalte, lien vers app.hgdc.ch", () => {
    const { container } = render(
      <AppShell product="mail" view="seul" nav={null}>
        Page
      </AppShell>,
    )
    expect(container.querySelector("[data-module-bar]")).toBeNull()
    expect(screen.getByRole("link", { name: "Ouvrir dans app.hgdc.ch" }).getAttribute("href")).toBe(
      "https://app.hgdc.ch/mail/auth/hgdc?next=%2F",
    )
  })

  it("« Toujours » montre la barre en vue seule, « Jamais » la retire sous app.hgdc.ch", () => {
    window.localStorage.setItem("hgdc-product-bar", "always")
    const { container, unmount } = render(
      <AppShell product="mail" view="seul" nav={null}>
        Page
      </AppShell>,
    )
    expect(container.querySelector("[data-module-bar]")).not.toBeNull()
    unmount()
    window.localStorage.setItem("hgdc-product-bar", "never")
    const again = render(
      <AppShell product="mail" view="app" nav={null}>
        Page
      </AppShell>,
    )
    expect(again.container.querySelector("[data-module-bar]")).toBeNull()
  })

  it("vue app : « Ouvrir seul » dans le menu du compte, vers l'entrée de la vue seule", async () => {
    render(
      <AppShell
        product="docs"
        view="app"
        nav={null}
        account={<AccountMenu user={{ name: "Hugo Gebel", email: "hugo@example.ch" }} onSignOut={() => {}} />}
      >
        Page
      </AppShell>,
    )
    expect(screen.queryByRole("link", { name: "Ouvrir seul" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    expect((await screen.findByRole("menuitem", { name: "Ouvrir seul" })).getAttribute("href")).toBe(
      "https://docs.hgdc.ch/auth/hgdc?next=%2F",
    )
  })

  it("sans `view` (Account, produit à une vue) : barre présente, réglage et autre vue ignorés", () => {
    window.localStorage.setItem("hgdc-product-bar", "never")
    for (const product of ["account", "mail"] as const) {
      const { container, unmount } = render(
        <AppShell product={product} nav={null}>
          Page
        </AppShell>,
      )
      expect(container.querySelector("[data-module-bar]")).not.toBeNull()
      expect(screen.queryByRole("link", { name: /Ouvrir/ })).toBeNull()
      unmount()
    }
  })

  it("`productRail` explicite l'emporte sur le réglage", () => {
    window.localStorage.setItem("hgdc-product-bar", "never")
    const { container } = render(
      <AppShell product="mail" view="app" productRail nav={null}>
        Page
      </AppShell>,
    )
    expect(container.querySelector("[data-module-bar]")).not.toBeNull()
  })
})

describe("AppShell, assistant", () => {
  function stubWide(wide: boolean): void {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query === "(min-width: 80rem)" ? wide : false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
  }

  function Harness({ initial = false }: { initial?: boolean }): React.JSX.Element {
    const [open, setOpen] = useState(initial)
    return (
      <AppShell
        product="mail"
        nav={null}
        onSearch={() => {}}
        assistant={{ open, onOpenChange: setOpen, shortcut: "j", panel: <textarea aria-label="Message" /> }}
      >
        <button type="button">Action de la page</button>
      </AppShell>
    )
  }

  it("bouton juste après la recherche, qui ouvre une colonne à droite sans couvrir la page (≥ 1280 px)", () => {
    stubWide(true)
    render(<Harness />)
    const search = screen.getByRole("button", { name: /Rechercher/ })
    const button = screen.getByRole("button", { name: "Assistant" })
    expect(search.nextElementSibling).toBe(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    // Rien de monté avant la première ouverture.
    expect(document.querySelector('[data-slot="app-shell-assistant"]')).toBeNull()

    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    const panel = screen.getByRole("region", { name: "Assistant" })
    expect(button.getAttribute("aria-controls")).toBe(panel.id)
    // Le focus entre dans la saisie ; la page reste utilisable à côté.
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Message" }))
    expect(screen.getByRole("button", { name: "Action de la page" }).closest("[inert]")).toBeNull()
    // Quatrième colonne de la grille : la page se rétrécit.
    const shell = document.querySelector('[data-slot="app-shell"]')
    expect(shell?.className).toContain("lg:grid-cols-[auto_minmax(0,1fr)_auto]")
    expect(shell?.hasAttribute("data-assistant")).toBe(true)
    expect(panel.className).toContain("xl:data-open:w-[26rem]")
    expect(panel.className).toContain("motion-reduce:transition-none")
  })

  it("Échap ferme, le focus revient au bouton, la conversation reste montée", () => {
    stubWide(true)
    render(<Harness initial />)
    const input = screen.getByRole("textbox", { name: "Message" })
    fireEvent.change(input, { target: { value: "Pourquoi ?" } })
    act(() => input.focus())
    fireEvent.keyDown(input, { key: "Escape" })
    const button = screen.getByRole("button", { name: "Assistant" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(button)
    const panel = document.querySelector('[data-slot="app-shell-assistant"]')
    expect(panel?.hasAttribute("inert")).toBe(true)
    expect(panel?.hasAttribute("data-open")).toBe(false)
    expect(panel?.querySelector("textarea")?.value).toBe("Pourquoi ?")
  })

  it("Ctrl+J ouvre et ferme", () => {
    stubWide(true)
    render(<Harness />)
    const button = screen.getByRole("button", { name: "Assistant" })
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+J Meta+J")
    act(() => {
      fireEvent.keyDown(document, { key: "j", ctrlKey: true })
    })
    expect(button.getAttribute("aria-expanded")).toBe("true")
    act(() => {
      fireEvent.keyDown(document, { key: "j", metaKey: true })
    })
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })

  it("sous 1280 px : vue dédiée, la page inerte dessous, « Retour à la page » la rend", () => {
    stubWide(false)
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }))
    const dialog = screen.getByRole("dialog", { name: "Assistant" })
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.className).toContain("data-open:max-xl:fixed")
    expect(document.querySelector("main")?.closest("[inert]")).not.toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "Retour à la page" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.querySelector("main")?.closest("[inert]")).toBeNull()
  })
})

describe("Avatars à initiales", () => {
  it("une teinte stable par clé, sans tenir compte de la casse, répartie sur les sept", () => {
    expect(avatarTone("hugo@example.ch")).toBe(avatarTone(" Hugo@Example.ch "))
    const tones = new Set(Array.from({ length: 200 }, (_, i) => avatarTone(`personne${i}@example.ch`)))
    expect([...tones].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("AvatarFallback colore les initiales par `colorKey`, sinon par le texte ; `colorKey={null}` reste neutre", () => {
    render(
      <>
        <Avatar>
          <AvatarFallback colorKey="hugo@example.ch">HG</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>AL</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback colorKey={null}>?</AvatarFallback>
        </Avatar>
      </>,
    )
    const [byKey, byText, neutral] = [...document.querySelectorAll('[data-slot="avatar-fallback"]')]
    expect(byKey?.getAttribute("data-tone")).toBe(String(avatarTone("hugo@example.ch")))
    expect(byKey?.className).toContain(`bg-avatar-${avatarTone("hugo@example.ch")}`)
    expect(byText?.getAttribute("data-tone")).toBe(String(avatarTone("AL")))
    expect(neutral?.hasAttribute("data-tone")).toBe(false)
    expect(neutral?.className).toContain("bg-muted")
  })

  it("AccountMenu : la même teinte dans la barre et dans le menu, tirée de l'adresse", async () => {
    render(<AccountMenu user={{ name: "Hugo Gebel", email: "hugo@example.ch" }} onSignOut={() => {}} products={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    await screen.findByRole("menu")
    const tones = [...document.querySelectorAll('[data-slot="avatar-fallback"]')].map((node) =>
      node.getAttribute("data-tone"),
    )
    expect(tones).toEqual([String(avatarTone("hugo@example.ch")), String(avatarTone("hugo@example.ch"))])
  })
})

describe("Chargement d'une page", () => {
  // Le calque et le H du départ suivent `data-loading`, la barre de progression `data-navigating` (styles.css).
  const shell = () => document.querySelector<HTMLElement>("[data-slot=app-shell]")
  const loading = () => shell()?.dataset.loading
  const progress = () => shell()?.dataset.navigating
  const hosts = () => document.querySelectorAll("[data-slot=family-loader-root]").length

  it("routerPendingDefaults : préchargement au survol, squelette après 1 s, au moins 500 ms", () => {
    expect(routerPendingDefaults).toEqual({
      defaultPendingComponent: PagePending,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      defaultPreload: "intent",
      defaultPreloadStaleTime: 0,
    })
  })

  it("navigation en cours : l'ancienne page reste, la barre de progression après 150 ms, au moins 300 ms", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <AppShell product="host" nav={<p>Barre</p>} navigating>
        <p>Ancienne page</p>
      </AppShell>,
    )
    expect(progress()).toBeUndefined()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(progress()).toBe("")
    // Ni calque ni H : l'ancienne page reste lisible et utilisable.
    expect(loading()).toBeUndefined()
    expect(screen.getByRole("main").inert).toBe(false)
    expect(screen.getByText("Ancienne page")).toBeDefined()
    expect(screen.getByRole("status", { name: "" }).textContent).toBe("Chargement de la page…")
    rerender(
      <AppShell product="host" nav={<p>Barre</p>} navigating={false}>
        <p>Nouvelle page</p>
      </AppShell>,
    )
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(progress()).toBe("")
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(progress()).toBeUndefined()
    vi.useRealTimers()
  })

  it("une navigation rapide (préchargée) ne montre rien", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <AppShell product="host" nav={null} navigating>
        Page
      </AppShell>,
    )
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender(
      <AppShell product="host" nav={null} navigating={false}>
        Page
      </AppShell>,
    )
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(progress()).toBeUndefined()
    expect(loading()).toBeUndefined()
    vi.useRealTimers()
  })

  it("PagePending dans la coque : le squelette de la page, ni calque ni H", () => {
    render(
      <FamilyLoaderRoot>
        <AppShell product="host" nav={null}>
          <PagePending label="Chargement du projet" variant="dashboard" />
        </AppShell>
      </FamilyLoaderRoot>,
    )
    expect(loading()).toBeUndefined()
    expect(hosts()).toBe(1)
    const main = screen.getByRole("main")
    const skeleton = within(main).getByRole("status", { name: "Chargement du projet" })
    expect(skeleton.dataset.slot).toBe("page-skeleton")
    expect(skeleton.dataset.variant).toBe("dashboard")
    // Ni H ni place de page : le CSS ne montre pas le H du document.
    expect(main.querySelector("[data-slot=family-loader], [data-slot=page-pending]")).toBeNull()
  })

  it("hydratée : `data-hydrated`", () => {
    render(
      <AppShell product="host" nav={null}>
        Page
      </AppShell>,
    )
    expect(document.querySelector<HTMLElement>("[data-slot=app-shell]")?.dataset.hydrated).toBe("")
    expect(document.querySelector<HTMLElement>("[data-slot=app-shell]")?.dataset.moduleBar).toBe("")
  })

  it("sous FamilyLoaderRoot : ni la coque ni la page ne montent leur propre H", () => {
    render(
      <FamilyLoaderRoot>
        <AppShell product="host" nav={null}>
          <PagePending />
        </AppShell>
      </FamilyLoaderRoot>,
    )
    expect(hosts()).toBe(1)
    expect(document.querySelector("[data-slot=app-shell] [data-slot=family-loader-root]")).toBeNull()
  })

  it("PagePending hors de la coque : la place de la page, et le H du document", () => {
    const { container } = render(<PagePending label="Ouverture" />)
    const place = container.querySelector<HTMLElement>("[data-slot=page-pending]")
    expect(place?.getAttribute("role")).toBe("status")
    expect(place?.getAttribute("aria-label")).toBe("Ouverture")
    expect(hosts()).toBe(1)
    cleanup()
    render(
      <FamilyLoaderRoot>
        <PagePending />
        <PagePending />
      </FamilyLoaderRoot>,
    )
    expect(hosts()).toBe(1)
  })

  it("contentKey : la page qui charge ses données montre son squelette à la place de l'ancienne", async () => {
    let resolve = () => {}
    const pending = new Promise<void>((r) => {
      resolve = r
    })
    let ready = false
    function SlowPage(): React.JSX.Element {
      if (!ready) throw pending
      return <p>Nouvelle page</p>
    }
    const { rerender } = render(
      <AppShell product="host" nav={null} contentKey="/a">
        <p>Ancienne page</p>
      </AppShell>,
    )
    rerender(
      <AppShell product="host" nav={null} contentKey="/b">
        <SlowPage />
      </AppShell>,
    )
    expect(screen.queryByText("Ancienne page")).toBeNull()
    expect(within(screen.getByRole("main")).getByRole("status", { name: "Chargement…" }).dataset.slot).toBe(
      "page-skeleton",
    )
    ready = true
    await act(async () => {
      resolve()
      await pending
    })
    expect(await screen.findByText("Nouvelle page")).toBeDefined()
  })

  it("clic sur un autre module dans la barre : le H couvre la zone de contenu après un court délai", async () => {
    render(
      <AppShell product="host" nav={null}>
        Page
      </AppShell>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Retour aux modules" }))
    const modules = screen.getByRole("navigation", { name: "Modules" })
    const mail = within(modules).getByRole("link", { name: "E-mails" })
    // Clic avec Ctrl (nouvel onglet) : la page reste.
    fireEvent.click(mail, { ctrlKey: true })
    expect(loading()).toBeUndefined()
    // Le navigateur de test ne quitte pas la page : on l'en empêche après la coque.
    const stay = (event: MouseEvent) => event.preventDefault()
    window.addEventListener("click", stay)
    fireEvent.click(mail)
    window.removeEventListener("click", stay)
    // Une page prérendue s'affiche avant : pas de H. Sinon il couvre le contenu.
    expect(loading()).toBeUndefined()
    await act(() => new Promise((resolve) => setTimeout(resolve, PRODUCT_LEAVE_DELAY_MS + 20)))
    expect(loading()).toBe("")
  })
})

describe("shellNavigation", () => {
  it("ne signale qu'un changement de page, et garde la page affichée comme clé", () => {
    const at = (pathname: string) => ({ pathname })
    expect(
      shellNavigation({ status: "pending", isLoading: true, location: at("/b"), resolvedLocation: at("/a") }),
    ).toEqual({ navigating: true, contentKey: "/a" })
    // Mise à jour de la page ouverte (recherche, filtres) : pas de calque.
    expect(
      shellNavigation({ status: "pending", isLoading: true, location: at("/a"), resolvedLocation: at("/a") }),
    ).toEqual({ navigating: false, contentKey: "/a" })
    expect(
      shellNavigation({ status: "idle", isLoading: false, location: at("/b"), resolvedLocation: at("/b") }),
    ).toEqual({ navigating: false, contentKey: "/b" })
    // Premier rendu, rien de résolu encore.
    expect(shellNavigation({ status: "idle", isLoading: false, location: at("/a") })).toEqual({
      navigating: false,
      contentKey: "/a",
    })
  })
})

describe("AccountMenu, choix du thème", () => {
  function open(): void {
    localStorage.clear()
    render(
      <ThemeProvider defaultTheme="light" storageKey="theme-switch-test">
        <AccountMenu user={{ name: "Hugo Gebel", email: "hugo@example.ch" }} onSignOut={() => {}} products={[]} />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
  }

  it("choisit un thème sans fermer le menu", async () => {
    open()
    const group = await screen.findByRole("radiogroup", { name: "Thème" })
    const radios = within(group).getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Système", "Clair", "Sombre"])
    expect(within(group).getByRole("radio", { name: "Clair" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(group).getByRole("radio", { name: "Sombre" }))
    expect(within(group).getByRole("radio", { name: "Sombre" }).getAttribute("aria-checked")).toBe("true")
    expect(within(group).getByRole("radio", { name: "Clair" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("menuitem", { name: "Se déconnecter" })).toBeDefined()
  })

  it("les flèches gauche et droite changent de thème", async () => {
    open()
    const group = await screen.findByRole("radiogroup", { name: "Thème" })
    const light = within(group).getByRole("radio", { name: "Clair" })
    light.focus()
    fireEvent.keyDown(light, { key: "ArrowRight" })
    expect(within(group).getByRole("radio", { name: "Sombre" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.keyDown(group, { key: "ArrowLeft" })
    expect(within(group).getByRole("radio", { name: "Clair" }).getAttribute("aria-checked")).toBe("true")
  })
})
