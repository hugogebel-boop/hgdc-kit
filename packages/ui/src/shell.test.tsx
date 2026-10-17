// @vitest-environment happy-dom
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AccountMenu } from "./account-menu.tsx"
import { AppShell, SidebarNav, SidebarNavItem, toggleSidebar } from "./app-shell.tsx"
import { CommandMenu, matchCommand } from "./command-menu.tsx"
import { OrgSwitcher } from "./org-switcher.tsx"
import { FamilyLoaderRoot } from "./family-loader.tsx"
import { PagePending, routerPendingDefaults, shellNavigation } from "./page-pending.tsx"
import { PRODUCT_RAIL_OPEN_DELAY } from "./product-rail.tsx"
import { PRODUCT_ENTRY_PATH } from "./products.ts"

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

  it("garde le bouton Déplier à la place du logo, jamais dessous", () => {
    const { container } = render(
      <AppShell product="mail" nav={nav}>
        Page
      </AppShell>,
    )
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    const brand = container.querySelector("[data-slot=sidebar-brand]")
    expect(brand?.textContent).toBe("Mail")
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

describe("Barre des produits", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("liste les sept produits, Account en tête, chacun par son entrée", () => {
    render(
      <AppShell product="mail" nav={null} accountHref="http://localhost:3000">
        Page
      </AppShell>,
    )
    const rail = screen.getByRole("navigation", { name: "Produits" })
    const links = within(rail).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual([
      "Account",
      "Host, Préversion",
      "Mail",
      "Portal",
      "Status",
      "Analytics",
      "Docs",
    ])
    const host = within(rail).getByRole("link", { name: /Host/ })
    expect(host.getAttribute("href")).toBe(`https://host.hgdc.ch${PRODUCT_ENTRY_PATH}?refresh=1&next=/`)
    expect(host.getAttribute("aria-current")).toBeNull()
    const mail = within(rail).getByRole("link", { name: "Mail" })
    expect(mail.getAttribute("aria-current")).toBe("page")
    expect(mail.getAttribute("href")).toBe("/")
    expect(within(rail).getByRole("link", { name: "Account" }).getAttribute("href")).toBe("http://localhost:3000")
  })

  it("porte le sélecteur d'organisation en haut", () => {
    render(
      <AppShell
        product="status"
        organization={<OrgSwitcher organizations={[{ id: "a", name: "Acme" }]} activeId="a" onSelect={() => {}} />}
        nav={null}
      >
        Page
      </AppShell>,
    )
    const rail = screen.getByRole("navigation", { name: "Produits" })
    expect(within(rail).getByRole("button", { name: "Organisation Acme, changer d'organisation" })).toBeDefined()
    expect(rail.firstElementChild?.tagName).toBe("BUTTON")
  })

  it("s'élargit au survol après un délai d'intention, se referme dès la sortie", () => {
    vi.useFakeTimers()
    render(
      <AppShell product="docs" nav={null}>
        Page
      </AppShell>,
    )
    const rail = screen.getByRole("navigation", { name: "Produits" })
    fireEvent.pointerEnter(rail, { pointerType: "mouse" })
    act(() => {
      vi.advanceTimersByTime(PRODUCT_RAIL_OPEN_DELAY - 10)
    })
    expect(rail.dataset.expanded).toBeUndefined()
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(rail.dataset.expanded).toBe("")
    // La barre latérale se plie le temps du survol : la barre prend sa place, sans recouvrir la page.
    const shell = document.querySelector<HTMLElement>("[data-slot=app-shell]")
    expect(shell?.dataset.railPeek).toBe("")
    fireEvent.pointerLeave(rail, { pointerType: "mouse" })
    expect(rail.dataset.expanded).toBeUndefined()
    expect(shell?.dataset.railPeek).toBeUndefined()

    // Un passage plus court que le délai n'ouvre rien.
    fireEvent.pointerEnter(rail, { pointerType: "mouse" })
    fireEvent.pointerLeave(rail, { pointerType: "mouse" })
    act(() => {
      vi.advanceTimersByTime(PRODUCT_RAIL_OPEN_DELAY * 2)
    })
    expect(rail.dataset.expanded).toBeUndefined()
  })

  it("reste élargie tant qu'un menu ouvert depuis la barre est ouvert, se replie à sa fermeture", async () => {
    vi.useFakeTimers()
    render(
      <AppShell
        product="host"
        organization={
          <OrgSwitcher
            organizations={[
              { id: "a", name: "Acme" },
              { id: "b", name: "Beta" },
            ]}
            activeId="a"
            onSelect={() => {}}
          />
        }
        nav={null}
      >
        Page
      </AppShell>,
    )
    const rail = screen.getByRole("navigation", { name: "Produits" })
    const shell = document.querySelector<HTMLElement>("[data-slot=app-shell]")
    fireEvent.pointerEnter(rail, { pointerType: "mouse" })
    act(() => {
      vi.advanceTimersByTime(PRODUCT_RAIL_OPEN_DELAY)
    })
    vi.useRealTimers()
    expect(rail.dataset.expanded).toBe("")

    const trigger = within(rail).getByRole("button", { name: "Organisation Acme, changer d'organisation" })
    fireEvent.click(trigger)
    await screen.findByRole("menuitem", { name: /Beta/ })
    // La souris quitte la barre pour aller dans le menu (dans un portail) : la barre reste élargie.
    fireEvent.pointerLeave(rail, { pointerType: "mouse" })
    await vi.waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"))
    expect(rail.dataset.expanded).toBe("")
    expect(shell?.dataset.railPeek).toBe("")

    // Organisation choisie à la souris, menu fermé, souris dehors : la barre se replie.
    const beta = screen.getByRole("menuitem", { name: /Beta/ })
    fireEvent.pointerDown(beta, { pointerType: "mouse" })
    fireEvent.click(beta)
    await vi.waitFor(() => expect(trigger.getAttribute("aria-expanded")).not.toBe("true"))
    await vi.waitFor(() => expect(rail.dataset.expanded).toBeUndefined())
    expect(shell?.dataset.railPeek).toBeUndefined()
  })

  it("se coupe par `productRail={false}`, l'organisation passe dans la barre latérale", () => {
    render(
      <AppShell
        product="account"
        productRail={false}
        organization={<OrgSwitcher organizations={[{ id: "a", name: "Acme" }]} activeId="a" onSelect={() => {}} />}
        nav={null}
      >
        Page
      </AppShell>,
    )
    expect(screen.queryByRole("navigation", { name: "Produits" })).toBeNull()
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

  it("dans une coque avec la barre des produits : section Produits masquée au-delà de lg, gardée sur téléphone", async () => {
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
    const { unmount } = render(
      <AppShell product="host" nav={null} sidebarFooter={menu}>
        Page
      </AppShell>,
    )
    const aside = screen.getByRole("complementary", { name: "Barre latérale" })
    fireEvent.click(within(aside).getByRole("button", { name: "Compte de Hugo Gebel" }))
    const mail = await screen.findByRole("menuitem", { name: "Mail" })
    // Toujours dans le menu (téléphone, < lg), caché par `lg:hidden` (≥ lg, la barre les montre).
    const group = mail.closest("[role=group]")
    expect(group?.className).toContain("lg:hidden")
    expect(
      screen.getByRole("menuitem", { name: "Se déconnecter" }).closest("[role=group]")?.className ?? "",
    ).not.toContain("lg:hidden")
    unmount()

    // Sans barre des produits (`productRail={false}`), la section reste visible partout.
    render(
      <AppShell product="account" productRail={false} nav={null} sidebarFooter={menu}>
        Page
      </AppShell>,
    )
    fireEvent.click(
      within(screen.getByRole("complementary", { name: "Barre latérale" })).getByRole("button", {
        name: "Compte de Hugo Gebel",
      }),
    )
    const mailAgain = await screen.findByRole("menuitem", { name: "Mail" })
    expect(mailAgain.closest("[role=group]")?.className ?? "").not.toContain("lg:hidden")
  })
})

describe("Chargement d'une page", () => {
  // Le calque et le H suivent `data-loading` sur la coque (styles.css).
  const loading = () => document.querySelector<HTMLElement>("[data-slot=app-shell]")?.dataset.loading
  const hosts = () => document.querySelectorAll("[data-slot=family-loader-root]").length

  it("routerPendingDefaults : préchargement au survol, chargement après 50 ms, au moins 300 ms", () => {
    expect(routerPendingDefaults).toEqual({
      defaultPendingComponent: PagePending,
      defaultPendingMs: 50,
      defaultPendingMinMs: 300,
      defaultPreload: "intent",
      defaultPreloadStaleTime: 0,
    })
  })

  it("navigation en cours : la zone de contenu se couvre du H après 50 ms, la coque reste, au moins 300 ms", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <AppShell product="host" nav={<p>Barre</p>} navigating>
        <p>Ancienne page</p>
      </AppShell>,
    )
    expect(loading()).toBeUndefined()
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(loading()).toBe("")
    expect(screen.getByRole("main").inert).toBe(true)
    // La coque est toujours là.
    expect(screen.getAllByText("Barre").length).toBeGreaterThan(0)
    rerender(
      <AppShell product="host" nav={<p>Barre</p>} navigating={false}>
        <p>Nouvelle page</p>
      </AppShell>,
    )
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(loading()).toBe("")
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(loading()).toBeUndefined()
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
      vi.advanceTimersByTime(30)
    })
    rerender(
      <AppShell product="host" nav={null} navigating={false}>
        Page
      </AppShell>,
    )
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(loading()).toBeUndefined()
    vi.useRealTimers()
  })

  it("PagePending dans la coque : la coque se couvre aussitôt, un seul H dans le document", () => {
    render(
      <AppShell product="host" nav={null}>
        <PagePending label="Chargement du projet" />
      </AppShell>,
    )
    expect(loading()).toBe("")
    expect(hosts()).toBe(1)
    const main = screen.getByRole("main")
    expect(within(main).getByRole("status", { name: "Chargement du projet" })).toBeDefined()
    // La page ne dessine pas de H : seule sa place est marquée.
    expect(main.querySelector("[data-slot=family-loader]")).toBeNull()
  })

  it("une page qui attend reste couverte au moins 300 ms, puis la coque se découvre", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <AppShell product="host" nav={null}>
        <PagePending />
      </AppShell>,
    )
    expect(loading()).toBe("")
    rerender(
      <AppShell product="host" nav={null}>
        <p>Page</p>
      </AppShell>,
    )
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(loading()).toBe("")
    act(() => {
      vi.advanceTimersByTime(60)
    })
    expect(loading()).toBeUndefined()
    vi.useRealTimers()
  })

  it("hydratée : `data-hydrated` (avant, le CSS seul montre le H d'une page qui attend)", () => {
    render(
      <AppShell product="host" nav={null}>
        Page
      </AppShell>,
    )
    expect(document.querySelector<HTMLElement>("[data-slot=app-shell]")?.dataset.hydrated).toBe("")
    expect(document.querySelector<HTMLElement>("[data-slot=app-shell]")?.dataset.productRail).toBe("")
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

  it("contentKey : la page qui charge ses données montre le H à la place de l'ancienne", async () => {
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
    expect(within(screen.getByRole("main")).getByRole("status", { name: "Chargement…" })).toBeDefined()
    ready = true
    await act(async () => {
      resolve()
      await pending
    })
    expect(await screen.findByText("Nouvelle page")).toBeDefined()
  })

  it("clic sur un autre produit dans la barre : le H couvre aussitôt la zone de contenu", () => {
    render(
      <AppShell product="host" nav={null}>
        Page
      </AppShell>,
    )
    const rail = screen.getByRole("navigation", { name: "Produits" })
    const mail = within(rail).getByRole("link", { name: /Mail/ })
    // Clic avec Ctrl (nouvel onglet) : la page reste.
    fireEvent.click(mail, { ctrlKey: true })
    expect(loading()).toBeUndefined()
    // Le navigateur de test ne quitte pas la page : on l'en empêche après la coque.
    const stay = (event: MouseEvent) => event.preventDefault()
    window.addEventListener("click", stay)
    fireEvent.click(mail)
    window.removeEventListener("click", stay)
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
