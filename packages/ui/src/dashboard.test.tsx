// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountMenu } from "./account-menu.tsx"
import { CommandMenuButton } from "./command-menu.tsx"
import { CopyButton } from "./copy-button.tsx"
import { HGDC_ENTRY_PATH } from "../../auth/src/index.ts"
import { HGDC_ACCOUNT, HGDC_PRODUCTS, PRODUCT_ENTRY_PATH, productMenuEntries } from "./products.ts"
import { Meter, Progress } from "./progress.tsx"
import { RankBar } from "./rank-bar.tsx"
import { StatusBadge, StatusDot } from "./status.tsx"
import { TimeChart } from "./time-chart.tsx"

/** Un lien de routeur : `RankBar` lui passe classe et contenu. */
function PageLink({ children, ...props }: React.ComponentProps<"a">) {
  return <a {...props}>{children}</a>
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("catalogue des produits", () => {
  it("décrit chaque produit par son mot, son sous-domaine et son état", () => {
    expect(HGDC_PRODUCTS.map((p) => p.word)).toEqual([
      "Host",
      "Mail",
      "Portal",
      "Status",
      "Analytics",
      "Docs",
      "IAssistant",
      "ID",
      "Manager",
    ])
    for (const product of [HGDC_ACCOUNT, ...HGDC_PRODUCTS]) {
      expect(product.name).toBe(product.word)
      expect(product.href).toBe(`https://${product.subdomain}`)
      expect(product.subdomain).toBe(`${product.word.toLowerCase()}.hgdc.ch`)
      expect(product.pitch).not.toMatch(/[–—]|\b(vous|votre|vos)\b/i)
    }
  })

  it("ne met au menu qu'Account et les produits ouverts, avec le produit courant coché", () => {
    const entries = productMenuEntries({ current: "mail" })
    expect(entries.map((e) => e.name)).toEqual([
      "Account",
      "Host",
      "Mail",
      "Portal",
      "Status",
      "Analytics",
      "Docs",
      "IAssistant",
      "ID",
      "Manager",
    ])
    expect(entries.find((e) => e.current)?.name).toBe("Mail")
    expect(entries.filter((e) => e.hint !== undefined).map((e) => e.name)).toEqual(["IAssistant"])
  })

  it("envoie chaque produit vers son entrée connectée, Account vers sa racine", () => {
    expect(PRODUCT_ENTRY_PATH).toBe(HGDC_ENTRY_PATH)
    const entries = productMenuEntries({ current: "Host" })
    expect(Object.fromEntries(entries.map((e) => [e.name, e.href]))).toEqual({
      Account: "https://account.hgdc.ch",
      Host: "https://app.hgdc.ch/host/auth/hgdc?refresh=background&next=/",
      Mail: "https://app.hgdc.ch/mail/auth/hgdc?refresh=background&next=/",
      Portal: "https://app.hgdc.ch/portal/auth/hgdc?refresh=background&next=/",
      Status: "https://app.hgdc.ch/status/auth/hgdc?refresh=background&next=/",
      Analytics: "https://app.hgdc.ch/analytics/auth/hgdc?refresh=background&next=/",
      Docs: "https://app.hgdc.ch/docs/auth/hgdc?refresh=background&next=/",
      IAssistant: "https://app.hgdc.ch/iassistant/auth/hgdc?refresh=background&next=/",
      ID: "https://id.hgdc.ch",
      Manager: "https://app.hgdc.ch/manager/auth/hgdc?refresh=background&next=/",
    })
    expect(HGDC_ACCOUNT.entryHref).toBe(HGDC_ACCOUNT.href)
    for (const product of HGDC_PRODUCTS) expect(product.href).toBe(`https://${product.subdomain}`)
  })

  it("remplace l'adresse d'Account pour le développement", () => {
    expect(productMenuEntries({ accountHref: "http://localhost:3000" })[0]?.href).toBe("http://localhost:3000")
  })
})

describe("AccountMenu et le catalogue", () => {
  const user = { name: "Hugo Gebel", email: "hugo@example.ch" }

  it("liste les produits du kit par défaut et coche le produit ouvert", async () => {
    render(<AccountMenu user={user} onSignOut={() => {}} product="Host" />)
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    const mail = await screen.findByRole("menuitem", { name: "Mail" })
    expect(mail.getAttribute("href")).toBe("https://app.hgdc.ch/mail/auth/hgdc?refresh=background&next=/")
    expect(screen.getByRole("menuitem", { name: "Account" }).getAttribute("href")).toBe("https://account.hgdc.ch")
    expect(screen.getByLabelText("Produit ouvert")).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Portal" }).getAttribute("href")).toBe(
      "https://app.hgdc.ch/portal/auth/hgdc?refresh=background&next=/",
    )
  })

  it("garde une liste passée par le produit, et la retire si elle est vide", async () => {
    const { unmount } = render(
      <AccountMenu user={user} onSignOut={() => {}} products={[{ name: "Labs", href: "https://labs.example" }]} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    expect(await screen.findByRole("menuitem", { name: "Labs" })).toBeDefined()
    expect(screen.queryByRole("menuitem", { name: "Mail" })).toBeNull()
    unmount()

    render(<AccountMenu user={user} onSignOut={() => {}} products={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    await screen.findByRole("menuitem", { name: "Se déconnecter" })
    expect(screen.queryByText("Produits")).toBeNull()
  })
})

describe("StatusBadge par ton", () => {
  it("écrit le libellé et colore selon le ton", () => {
    render(<StatusBadge tone="success" label="Remis" />)
    const badge = screen.getByText("Remis")
    expect(badge.getAttribute("data-tone")).toBe("success")
    expect(badge.getAttribute("data-status")).toBe("operational")
  })

  it("anime le point d'un statut en attente, sauf demande contraire", () => {
    const { container, rerender } = render(<StatusBadge tone="pending" label="En construction" />)
    expect(container.querySelector(".live-ping")).not.toBeNull()
    rerender(<StatusBadge tone="pending" label="En file" live={false} />)
    expect(container.querySelector(".live-ping")).toBeNull()
  })

  it("garde les statuts de service et leurs libellés", () => {
    render(<StatusBadge status="outage" />)
    expect(screen.getByText("Panne").getAttribute("data-status")).toBe("outage")
  })

  it("accepte un ton sur le point seul", () => {
    const { container } = render(<StatusDot tone="danger" />)
    expect(container.querySelector(".bg-status-outage")).not.toBeNull()
  })
})

describe("CopyButton avec libellé", () => {
  it("affiche son libellé, copie, puis dit « Copié »", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<CopyButton value="MX 10 send" label="Tout copier" showLabel />)
    const button = screen.getByRole("button", { name: "Tout copier" })
    fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith("MX 10 send")
    expect(await screen.findByText("Copié", { selector: "[aria-live]" })).toBeDefined()
    expect(button.getAttribute("data-copied")).toBe("true")
  })
})

describe("CommandMenuButton compact", () => {
  it("garde un nom accessible avec la loupe seule", () => {
    const onClick = vi.fn<() => void>()
    render(<CommandMenuButton onClick={onClick} compact />)
    const button = screen.getByRole("button", { name: "Rechercher" })
    expect(button.getAttribute("data-compact")).toBe("true")
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+K Meta+K")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("ne compacte que sous lg en mode mobile", () => {
    render(<CommandMenuButton onClick={() => {}} compact="mobile" />)
    expect(screen.getByText("Rechercher").className).toContain("max-lg:sr-only")
  })
})

describe("Progress et Meter", () => {
  it("expose une barre d'avancement nommée et sa valeur", () => {
    render(<Progress label="Envoi de la campagne" value={120} max={400} valueText="120 sur 400 e-mails" />)
    const bar = screen.getByRole("progressbar", { name: "Envoi de la campagne" })
    expect(bar.getAttribute("aria-valuenow")).toBe("120")
    expect(bar.getAttribute("aria-valuetext")).toBe("120 sur 400 e-mails")
    expect(screen.getByText("120 sur 400 e-mails")).toBeDefined()
  })

  it("rend une durée inconnue sans valeur", () => {
    render(<Progress label="Préparation" value={null} />)
    const bar = screen.getByRole("progressbar", { name: "Préparation" })
    expect(bar.hasAttribute("aria-valuenow")).toBe(false)
  })

  it("passe une jauge à l'orange puis au rouge près de la limite", () => {
    const { rerender, container } = render(<Meter label="Quota" value={50} max={100} />)
    expect(screen.getByRole("meter", { name: "Quota" })).toBeDefined()
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("normal")
    rerender(<Meter label="Quota" value={85} max={100} />)
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("warning")
    rerender(<Meter label="Quota" value={99} max={100} />)
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("danger")
  })
})

describe("RankBar", () => {
  const items = [
    { key: "b", label: "/tarifs", value: 40 },
    { key: "a", label: "/", value: 100 },
    { key: "c", label: "/blog", value: 10 },
  ]

  it("classe du plus grand au plus petit, barre proportionnelle au premier", () => {
    const { container } = render(<RankBar label="Pages les plus vues" items={items} />)
    const list = screen.getByRole("list", { name: "Pages les plus vues" })
    const rows = list.querySelectorAll("li")
    expect([...rows].map((r) => r.textContent)).toEqual(["/100", "/tarifs40", "/blog10"])
    const fills = [...container.querySelectorAll<HTMLElement>("[data-slot=rank-bar-fill]")]
    expect(fills.map((f) => f.style.width)).toEqual(["100%", "40%", "10%"])
  })

  it("limite le nombre de lignes et rend une ligne en lien", () => {
    render(<RankBar label="Pages" items={[...items, { key: "d", label: "/contact", value: 5 }]} limit={2} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    cleanup()
    render(
      <RankBar
        label="Pages"
        items={[{ key: "a", label: "/", value: 3, render: <PageLink href="/pages/accueil" /> }]}
      />,
    )
    expect(screen.getByRole("link", { name: "/ 3" }).getAttribute("href")).toBe("/pages/accueil")
  })

  it("dit quand il n'y a rien à classer", () => {
    render(<RankBar label="Pays" items={[]} />)
    expect(screen.getByText("Rien à classer sur cette période.")).toBeDefined()
  })
})

describe("TimeChart et le dernier point incomplet", () => {
  const day = 86_400_000
  const timestamps = [0, 1, 2].map((i) => Date.UTC(2026, 9, 13) + i * day)

  it("trace le dernier segment en pointillés et le signale aux lecteurs d'écran", () => {
    const { container } = render(
      <TimeChart
        label="Visites"
        timestamps={timestamps}
        series={[{ key: "v", label: "Visites", values: [10, 12, 3] }]}
        lastIncomplete
      />,
    )
    const dashed = container.querySelector("[data-slot=time-chart-incomplete]")
    expect(dashed?.getAttribute("stroke-dasharray")).toBe("3 4")
    expect(dashed?.getAttribute("d")).toBe("M1.5 20L2.5 80")
    expect(screen.getByRole("slider", { name: "Visites" }).getAttribute("aria-valuetext")).toContain("(en cours)")
    expect(container.querySelector("table")?.textContent).toContain("(en cours)")
  })

  it("ne trace rien en pointillés par défaut", () => {
    const { container } = render(
      <TimeChart
        label="Visites"
        timestamps={timestamps}
        series={[{ key: "v", label: "Visites", values: [1, 2, 3] }]}
      />,
    )
    expect(container.querySelector("[data-slot=time-chart-incomplete]")).toBeNull()
  })
})
