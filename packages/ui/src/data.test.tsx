// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CopyButton } from "./copy-button.tsx"
import { formatRelative } from "./relative-time.tsx"
import { ResourceItem, ResourceList } from "./resource-list.tsx"
import { StatTile } from "./stat.tsx"
import { StatusBadge } from "./status.tsx"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableRowLink } from "./table.tsx"
import { TimeChart, niceScale } from "./time-chart.tsx"
import { Timeline } from "./timeline.tsx"
import { UptimeBar } from "./uptime-bar.tsx"

afterEach(cleanup)

describe("Table", () => {
  it("annonce le tri par aria-sort et trie au clic", () => {
    const onSort = vi.fn<() => void>()
    render(
      <Table aria-label="Déploiements">
        <TableHeader>
          <TableRow>
            <TableHead sort="descending" onSort={onSort}>
              Date
            </TableHead>
            <TableHead numeric>Durée</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              <TableRowLink href="/d/1">Production</TableRowLink>
            </TableCell>
            <TableCell numeric>42 s</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const head = screen.getByRole("columnheader", { name: "Date" })
    expect(head.getAttribute("aria-sort")).toBe("descending")
    fireEvent.click(screen.getByRole("button", { name: "Date" }))
    expect(onSort).toHaveBeenCalledOnce()
    expect(screen.getByRole("columnheader", { name: "Durée" }).hasAttribute("aria-sort")).toBe(false)
    expect(screen.getByRole("cell", { name: "42 s" }).className).toContain("tabular-nums")
  })

  it("rend la ligne cliquable par un vrai lien", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>
              <TableRowLink href="/d/1">Production</TableRowLink>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const link = screen.getByRole("link", { name: "Production" })
    expect(link.getAttribute("href")).toBe("/d/1")
    expect(link.className).toContain("after:absolute")
  })

  it("dit quand il n'y a aucune ligne, sur toute la largeur", () => {
    render(
      <Table>
        <TableBody>
          <TableEmpty colSpan={3}>Aucun déploiement pour l'instant.</TableEmpty>
        </TableBody>
      </Table>,
    )
    expect(screen.getByRole("cell").getAttribute("colspan")).toBe("3")
  })
})

describe("ResourceList", () => {
  it("fait du titre le lien de la ligne, les actions restent à part", () => {
    render(
      <ResourceList aria-label="Projets">
        <ResourceItem
          title="Site vitrine"
          meta="acme.ch"
          href="/p/site"
          actions={<button type="button">Plus</button>}
        />
      </ResourceList>,
    )
    expect(screen.getByRole("link", { name: "Site vitrine" }).getAttribute("href")).toBe("/p/site")
    expect(screen.getByRole("button", { name: "Plus" })).toBeDefined()
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })
})

describe("StatTile", () => {
  it("dit le sens de la variation en mots, et colore selon ce qui est bon", () => {
    render(<StatTile label="Erreurs" value="12" delta={{ value: "8 %", direction: "up", good: "down" }} />)
    const delta = document.querySelector("[data-slot=stat-delta]")
    expect(delta?.textContent).toContain("en hausse de")
    expect(delta?.className).toContain("text-destructive")
  })
})

describe("StatusBadge", () => {
  it("écrit toujours le statut, jamais la couleur seule", () => {
    render(<StatusBadge status="degraded" />)
    expect(screen.getByText("Dégradé").className).toContain("text-status-degraded-ink")
  })
})

describe("formatRelative", () => {
  const now = Date.UTC(2026, 9, 15, 12, 0, 0)
  it.each([
    [now - 10_000, "à l'instant"],
    [now - 3 * 60_000, "il y a 3 min"],
    [now - 2 * 3_600_000, "il y a 2 h"],
    [now + 5 * 60_000, "dans 5 min"],
  ])("formate %s", (date, expected) => {
    // Intl sépare le nombre de l'unité par une espace insécable fine.
    expect(formatRelative(date, now).replace(/\s/g, " ")).toBe(expected)
  })

  it("passe à la date au-delà d'une semaine, avec l'année si elle change", () => {
    expect(formatRelative(Date.UTC(2026, 9, 1, 12), now)).toMatch(/^1 oct/)
    expect(formatRelative(Date.UTC(2025, 9, 1, 12), now)).toMatch(/2025/)
  })
})

describe("niceScale", () => {
  it("arrondit le maximum à une graduation lisible", () => {
    expect(niceScale(94)).toEqual({ max: 100, step: 25 })
    expect(niceScale(7)).toEqual({ max: 8, step: 2 })
    expect(niceScale(0)).toEqual({ max: 1, step: 0.25 })
  })
})

describe("TimeChart", () => {
  const timestamps = [Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 2), Date.UTC(2026, 9, 3)]

  it("se lit au clavier comme un curseur, valeur par valeur", () => {
    render(
      <TimeChart
        label="Envois par jour"
        timestamps={timestamps}
        series={[
          { key: "sent", label: "Envoyés", values: [10, 20, 30] },
          { key: "bounced", label: "Rejetés", values: [1, null, 3] },
        ]}
      />,
    )
    const slider = screen.getByRole("slider", { name: "Envois par jour" })
    fireEvent.keyDown(slider, { key: "Home" })
    expect(slider.getAttribute("aria-valuenow")).toBe("0")
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(slider.getAttribute("aria-valuetext")).toContain("Envoyés 20")
    expect(slider.getAttribute("aria-valuetext")).toContain("Rejetés pas de mesure")
    // Légende dès deux séries, et un tableau des données pour les lecteurs d'écran.
    expect(screen.getByText("Rejetés", { selector: "figcaption span" })).toBeDefined()
    expect(screen.getByRole("table", { name: "Envois par jour" })).toBeDefined()
  })

  it("dit qu'il n'y a pas de données plutôt que de tracer un axe vide", () => {
    render(<TimeChart label="Visites" timestamps={[]} series={[]} />)
    expect(screen.getByText("Aucune donnée sur cette période.")).toBeDefined()
  })
})

describe("UptimeBar", () => {
  it("donne à chaque jour son statut en mots", () => {
    render(
      <UptimeBar
        days={[
          { date: Date.UTC(2026, 9, 14), status: "operational", uptime: "100 %" },
          { date: Date.UTC(2026, 9, 15), status: "outage", note: "Panne de 12 min" },
        ]}
      />,
    )
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[1]?.textContent).toContain("Panne")
    expect(items[1]?.textContent).toContain("Panne de 12 min")
  })
})

describe("Timeline", () => {
  it("liste les étapes dans l'ordre donné", () => {
    const now = Date.UTC(2026, 9, 15, 12)
    render(
      <Timeline
        now={now}
        entries={[
          { id: "b", title: "Résolu", time: now - 60_000, status: "operational" },
          { id: "a", title: "Identifié", time: now - 3_600_000, status: "outage" },
        ]}
      />,
    )
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Résolu",
      "Identifié",
    ])
    expect(screen.getByText("il y a 1 min").tagName).toBe("TIME")
  })
})

describe("CopyButton", () => {
  it("copie la valeur et annonce « Copié »", async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<CopyButton value="npm i @hgdc/ui" />)
    fireEvent.click(screen.getByRole("button", { name: "Copier" }))
    expect(writeText).toHaveBeenCalledWith("npm i @hgdc/ui")
    expect(await screen.findByRole("button", { name: "Copié" })).toBeDefined()
  })
})
