// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DataTable, nextSort, type DataTableColumn } from "./data-table.tsx"
import { DnsRecordTable } from "./dns-record-table.tsx"
import {
  FilterBar,
  activeFilterCount,
  activeFilterOnlyCount,
  filterSummary,
  toggleFilterValue,
  type FilterDefinition,
} from "./filter-bar.tsx"
import { LogViewer, filterLogLines, formatLogLines, visibleRange, type LogLine } from "./log-viewer.tsx"
import { MiddleTruncate, splitForTruncation } from "./middle-truncate.tsx"
import { Sparkline, describeSparkline } from "./sparkline.tsx"
import { UptimeBar, nextDay } from "./uptime-bar.tsx"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const STATUS: FilterDefinition = {
  key: "status",
  label: "Statut",
  options: [
    { value: "ready", label: "Prêt" },
    { value: "error", label: "Erreur" },
    { value: "building", label: "En cours" },
  ],
}

describe("FilterBar", () => {
  it("résume la pastille et garde l'ordre des options", () => {
    expect(filterSummary(STATUS)).toBe("Statut")
    expect(filterSummary(STATUS, ["error"])).toBe("Statut : Erreur")
    expect(filterSummary(STATUS, ["building", "ready"])).toBe("Statut : Prêt +1")
    expect(toggleFilterValue(STATUS, ["building"], "ready", true)).toEqual(["ready", "building"])
    expect(toggleFilterValue(STATUS, ["ready", "building"], "ready", false)).toEqual(["building"])
    expect(activeFilterCount({ status: [], env: ["prod"] }, " ")).toBe(1)
  })

  it("n'écrit la recherche qu'après le délai, Échap la vide", () => {
    vi.useFakeTimers()
    const onChange = vi.fn<(value: string) => void>()
    const { rerender } = render(<FilterBar search={{ value: "", onChange }} />)
    const input = screen.getByRole("searchbox", { name: "Rechercher" })
    fireEvent.change(input, { target: { value: "acme" } })
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenLastCalledWith("acme")
    rerender(<FilterBar search={{ value: "acme", onChange }} />)
    fireEvent.keyDown(input, { key: "Escape" })
    expect(onChange).toHaveBeenLastCalledWith("")
  })

  it("reprend la valeur de l'URL quand elle change de son côté", () => {
    const onChange = vi.fn<(value: string) => void>()
    const { rerender } = render(<FilterBar search={{ value: "acme", onChange }} />)
    rerender(<FilterBar search={{ value: "globex", onChange }} />)
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("globex")
  })

  it("montre « Effacer » dès qu'un critère est posé", () => {
    const onReset = vi.fn<() => void>()
    const { rerender } = render(<FilterBar filters={[STATUS]} values={{}} onReset={onReset} />)
    expect(screen.queryByRole("button", { name: "Effacer" })).toBeNull()
    rerender(<FilterBar filters={[STATUS]} values={{ status: ["error"] }} onReset={onReset} />)
    expect(screen.getByRole("button", { name: "Statut : Erreur" }).getAttribute("aria-haspopup")).toBe("menu")
    fireEvent.click(screen.getByRole("button", { name: "Effacer" }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByRole("search")).toBeTruthy()
  })
})

describe("FilterBar en panneau", () => {
  const PERIOD: FilterDefinition = {
    key: "period",
    label: "Période",
    single: true,
    options: [
      { value: "7d", label: "7 jours" },
      { value: "30d", label: "30 jours" },
    ],
  }

  it("range les filtres derrière « Filtres », compte ceux posés sans la recherche", () => {
    expect(activeFilterOnlyCount({ status: ["error", "ready"], period: [] })).toBe(1)
    render(
      <FilterBar
        variant="panel"
        search={{ value: "acme", onChange: () => {} }}
        filters={[STATUS, PERIOD]}
        values={{ status: ["error"], period: ["7d"] }}
      />,
    )
    expect(screen.getByRole("searchbox")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Statut/ })).toBeNull()
    const trigger = screen.getByRole("button", { name: "Filtres, 2 actifs" })
    expect(trigger.textContent).toContain("2")
  })

  it("ouvre le panneau : choix multiple, choix unique avec « Tous », réinitialiser garde la recherche", () => {
    const onFilterChange = vi.fn<(key: string, values: Array<string>) => void>()
    const onResetFilters = vi.fn<() => void>()
    render(
      <FilterBar
        variant="panel"
        filters={[STATUS, PERIOD]}
        values={{ status: ["error"] }}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Filtres, 1 actif" }))
    const status = screen.getByRole("group", { name: "Statut" })
    expect(within(status).getByRole("checkbox", { name: "Erreur" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(status).getByRole("checkbox", { name: "Prêt" }))
    expect(onFilterChange).toHaveBeenLastCalledWith("status", ["ready", "error"])
    const period = screen.getByRole("radiogroup", { name: "Période" })
    expect(within(period).getByRole("radio", { name: "Tous" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(period).getByRole("radio", { name: "30 jours" }))
    expect(onFilterChange).toHaveBeenLastCalledWith("period", ["30d"])
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }))
    expect(onResetFilters).toHaveBeenCalledOnce()
  })
})

type Deployment = { id: string; name: string; duration: number }
const COLUMNS: Array<DataTableColumn<Deployment>> = [
  { key: "name", header: "Nom", cell: (d) => d.name, sortable: true },
  {
    key: "duration",
    header: "Durée",
    cell: (d) => `${d.duration} s`,
    numeric: true,
    sortable: true,
    firstDirection: "descending",
  },
]

describe("DataTable", () => {
  it("change de sens sur la colonne triée, part du sens premier ailleurs", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", direction: "ascending" })
    expect(nextSort({ key: "name", direction: "ascending" }, "name")).toEqual({ key: "name", direction: "descending" })
    expect(nextSort({ key: "name", direction: "ascending" }, "duration", "descending")).toEqual({
      key: "duration",
      direction: "descending",
    })
  })

  it("trie, pagine et dit l'état du tri", () => {
    const onSortChange = vi.fn<(sort: unknown) => void>()
    const onPageChange = vi.fn<(page: number) => void>()
    render(
      <DataTable
        label="Déploiements"
        rows={[{ id: "1", name: "Production", duration: 42 }]}
        columns={COLUMNS}
        rowKey={(d) => d.id}
        sort={{ key: "name", direction: "ascending" }}
        onSortChange={onSortChange}
        pagination={{ page: 1, pageCount: 3, onPageChange }}
      />,
    )
    expect(screen.getByRole("columnheader", { name: "Nom" }).getAttribute("aria-sort")).toBe("ascending")
    fireEvent.click(screen.getByRole("button", { name: "Durée" }))
    expect(onSortChange).toHaveBeenCalledWith({ key: "duration", direction: "descending" })
    expect(screen.getByRole("button", { name: "Précédente" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Suivante" }))
    expect(onPageChange).toHaveBeenCalledWith(2)
    expect(screen.getByText("Page 1 sur 3")).toBeTruthy()
  })

  it("charge en squelette, puis distingue vide et filtré", () => {
    const { rerender } = render(
      <DataTable label="Déploiements" rows={undefined} columns={COLUMNS} rowKey={(d) => d.id} />,
    )
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true")
    rerender(
      <DataTable label="Déploiements" rows={[]} columns={COLUMNS} rowKey={(d) => d.id} empty="Aucun déploiement." />,
    )
    expect(screen.getByText("Aucun déploiement.")).toBeTruthy()
    rerender(<DataTable label="Déploiements" rows={[]} columns={COLUMNS} rowKey={(d) => d.id} filtered />)
    expect(screen.getByText("Aucun résultat pour ces filtres.")).toBeTruthy()
  })

  it("remplace le tableau par l'erreur, et charge plus à la demande", () => {
    const onLoadMore = vi.fn<() => void>()
    const { rerender } = render(
      <DataTable label="Envois" rows={[]} columns={COLUMNS} rowKey={(d) => d.id} error={<p>Échec</p>} />,
    )
    expect(screen.queryByRole("table")).toBeNull()
    rerender(
      <DataTable
        label="Envois"
        rows={[{ id: "1", name: "Bienvenue", duration: 1 }]}
        columns={COLUMNS}
        rowKey={(d) => d.id}
        loadMore={{ hasMore: true, onLoadMore }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Charger plus" }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })
})

describe("DnsRecordTable", () => {
  it("donne à chaque ligne sa valeur à copier et son statut en mots", () => {
    const dkim = `p=${"A".repeat(200)}`
    render(
      <DnsRecordTable
        records={[
          {
            type: "MX",
            name: "send",
            value: "feedback-smtp.eu-central-2.amazonses.com",
            priority: 10,
            status: "verified",
          },
          { type: "TXT", name: "hgdc._domainkey", value: dkim, status: "pending" },
        ]}
      />,
    )
    const table = screen.getByRole("table", { name: "Enregistrements DNS" })
    expect(within(table).getByRole("columnheader", { name: "Priorité" })).toBeTruthy()
    expect(within(table).queryByRole("columnheader", { name: "TTL" })).toBeNull()
    expect(screen.getByText("Vérifié")).toBeTruthy()
    expect(screen.getByText("En attente")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copier la valeur TXT" })).toBeTruthy()
    // La valeur coupée reste entière dans la page.
    expect(table.textContent).toContain(dkim)
  })
})

describe("MiddleTruncate", () => {
  it("garde la fin d'un chemin ou d'un identifiant", () => {
    expect(splitForTruncation("apps/web/src/routes/index.tsx")).toEqual(["apps/web/src/routes", "/index.tsx"])
    expect(splitForTruncation("dpl_8f3a2c91e7b4d0aa")).toEqual(["dpl_8f3a2c91", "e7b4d0aa"])
    expect(splitForTruncation("court")).toEqual(["court", ""])
  })

  it("laisse le texte entier dans la page et l'infobulle", () => {
    render(<MiddleTruncate text="dpl_8f3a2c91e7b4d0aa" />)
    const node = screen.getByTitle("dpl_8f3a2c91e7b4d0aa")
    expect(node.textContent).toBe("dpl_8f3a2c91e7b4d0aa")
  })
})

describe("Sparkline", () => {
  it("se lit comme une image qui dit l'étendue et la dernière valeur", () => {
    render(<Sparkline label="Envois sur 7 jours" values={[3, 8, null, 5]} />)
    expect(screen.getByRole("img", { name: "Envois sur 7 jours : de 3 à 8, dernière valeur 5" })).toBeTruthy()
    expect(describeSparkline("Erreurs", [null])).toBe("Erreurs : aucune donnée")
  })
})

describe("UptimeBar", () => {
  const days = [0, 1, 2].map((i) => ({ date: Date.UTC(2026, 9, 10 + i), status: "operational" as const }))

  it("légende qui passe à la ligne : un long résumé ne déborde pas sur un téléphone", () => {
    const { container } = render(
      <UptimeBar days={days} summary="99,95 % de disponibilité sur 90 jours, deux incidents résolus" />,
    )
    const legend = container.querySelector("[data-slot=uptime-legend]")
    expect(legend?.className).toContain("flex-wrap")
    expect(legend?.textContent).toContain("deux incidents résolus")
    expect(legend?.querySelector(".min-w-0")?.textContent).toContain("99,95 %")
  })

  it("ne fait qu'un arrêt de tabulation, les flèches passent d'un jour à l'autre", () => {
    render(<UptimeBar days={days} />)
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0])
    act(() => buttons[2]?.focus())
    fireEvent.keyDown(buttons[2] as HTMLElement, { key: "ArrowLeft" })
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1])
    expect(nextDay("Home", 2, 3)).toBe(0)
    expect(nextDay("ArrowRight", 2, 3)).toBe(2)
    expect(nextDay("a", 2, 3)).toBeNull()
  })

  it("ouvre le détail d'un jour : durée par niveau et incidents en liens", async () => {
    render(
      <UptimeBar
        days={[
          {
            date: Date.UTC(2026, 9, 14),
            status: "outage",
            uptime: "99,17 %",
            detail: {
              levels: [
                { status: "outage", label: "Panne majeure", duration: "12 min" },
                { status: "maintenance", label: "Maintenance", duration: "1 h" },
              ],
              incidents: [{ title: "Panne de la Console", href: "/host/incidents/abc" }],
            },
          },
          { date: Date.UTC(2026, 9, 15), status: "operational", detail: { levels: [], incidents: [] } },
        ]}
      />,
    )
    const buttons = screen.getAllByRole("button")
    expect(buttons[0]?.textContent).toContain("Panne majeure 12 min · Maintenance 1 h · Panne de la Console")
    expect(buttons[1]?.textContent).toContain("Aucune panne ce jour-là")
    fireEvent.click(buttons[0] as HTMLElement)
    const link = await screen.findByRole("link", { name: "Panne de la Console" })
    expect(link.getAttribute("href")).toBe("/host/incidents/abc")
    expect(screen.getByRole("dialog").textContent).toContain("Maintenance1 h")
  })
})

function makeLines(count: number): Array<LogLine> {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    time: Date.UTC(2026, 9, 15, 8, 0, 0, i),
    level: i % 10 === 0 ? ("error" as const) : ("info" as const),
    message: i % 10 === 0 ? `Échec de la requête ${i}` : `GET /api/${i} 200`,
  }))
}

describe("LogViewer", () => {
  it("filtre par niveau et par texte, sans casse", () => {
    const lines = makeLines(30)
    expect(filterLogLines(lines, { levels: ["error"] })).toHaveLength(3)
    expect(filterLogLines(lines, { query: "échec" })).toHaveLength(3)
    expect(filterLogLines(lines, {})).toBe(lines)
    expect(formatLogLines(lines.slice(0, 1), () => "08:00:00")).toBe("08:00:00 ERROR Échec de la requête 0")
  })

  it("ne rend que les lignes visibles d'un long journal", () => {
    expect(visibleRange(0, 240, 10_000)).toEqual([0, 30])
    expect(visibleRange(24_000, 240, 10_000)).toEqual([980, 1030])
    render(<LogViewer lines={makeLines(10_000)} height={240} />)
    const log = screen.getByRole("log", { name: "Journaux" })
    expect(log.querySelectorAll("[data-slot=log-line]").length).toBeLessThan(60)
    expect(log.tabIndex).toBe(0)
  })

  it("filtre par niveau au clic, dit quand rien ne correspond", () => {
    render(<LogViewer lines={makeLines(20)} />)
    const error = screen.getByRole("button", { name: "Erreur" })
    fireEvent.click(error)
    expect(error.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getAllByText(/Échec de la requête/)).toHaveLength(2)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "introuvable" } })
    expect(screen.getByText("Aucune ligne ne correspond.")).toBeTruthy()
  })

  it("propose « Suivre » en direct, et le reprend après un arrêt", () => {
    render(<LogViewer lines={makeLines(5)} live />)
    const follow = screen.getByRole("button", { name: "Suivre" })
    expect(follow.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(follow)
    fireEvent.click(screen.getByRole("button", { name: "Revenir en bas" }))
    expect(screen.getByRole("button", { name: "Suivre" }).getAttribute("aria-pressed")).toBe("true")
  })
})
