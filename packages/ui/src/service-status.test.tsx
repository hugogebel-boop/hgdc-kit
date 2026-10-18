// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { eventsFromSummary, ServiceStatus, statusPageUrlFor, UPCOMING_NOTICE_MS } from "./service-status.tsx"

const NOW = Date.parse("2026-10-18T12:30:00Z")
const PAGE = "https://status.hgdc.ch/host"
const iso = (t: number) => new Date(t).toISOString()

const summary = (over: Record<string, unknown> = {}) => ({
  page: { id: "p", name: "Host", url: PAGE },
  incidents: [
    {
      id: "i1",
      name: "Panne de Connexion et données",
      status: "identified",
      impact: "critical",
      updated_at: "2026-10-18T12:15:00Z",
      shortlink: `${PAGE}/incidents/i1`,
    },
  ],
  scheduled_maintenances: [
    {
      id: "m1",
      name: "Mise à jour de l'API",
      status: "scheduled",
      updated_at: "2026-10-16T08:00:00Z",
      scheduled_for: iso(NOW + 3 * 3_600_000),
      scheduled_until: iso(NOW + 4 * 3_600_000),
      shortlink: `${PAGE}/incidents/m1`,
    },
    {
      id: "m2",
      name: "Plus tard",
      status: "scheduled",
      scheduled_for: iso(NOW + UPCOMING_NOTICE_MS + 60_000),
      scheduled_until: iso(NOW + UPCOMING_NOTICE_MS + 3_600_000),
    },
  ],
  ...over,
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.sessionStorage.clear()
})

describe("eventsFromSummary", () => {
  it("incident ouvert, puis maintenance des 24 prochaines heures ; rien au-delà", () => {
    const events = eventsFromSummary(summary(), NOW)
    expect(events.map((e) => [e.kind, e.status, e.title])).toEqual([
      ["incident", "outage", "Panne de Connexion et données"],
      ["upcoming", "maintenance", "Mise à jour de l'API"],
    ])
    expect(events[0]?.detail).toBe("Cause identifiée · mis à jour à 14:15")
    expect(events[0]?.href).toBe(`${PAGE}/incidents/i1`)
  })

  it("maintenance en cours ; incident résolu ignoré ; forme inattendue sans effet", () => {
    const events = eventsFromSummary(
      summary({
        incidents: [{ id: "i2", name: "Réglé", status: "resolved", impact: "major" }, { name: "sans id" }, "x"],
        scheduled_maintenances: [
          {
            id: "m3",
            name: "Envoi",
            status: "in_progress",
            scheduled_for: iso(NOW - 60_000),
            scheduled_until: iso(NOW + 1_800_000),
          },
        ],
      }),
      NOW,
    )
    expect(events.map((e) => [e.kind, e.title, e.detail])).toEqual([["maintenance", "Envoi", "jusqu'à 15:00"]])
    expect(eventsFromSummary(null, NOW)).toEqual([])
    expect(eventsFromSummary({ incidents: "?" }, NOW)).toEqual([])
  })

  it("Docs vit à /documentation", () => {
    expect(statusPageUrlFor("docs")).toBe("https://status.hgdc.ch/documentation")
    expect(statusPageUrlFor("host")).toBe("https://status.hgdc.ch/host")
  })
})

describe("ServiceStatus", () => {
  it("lit après le rendu, montre l'incident, se ferme jusqu'à la mise à jour suivante", async () => {
    const fetch = vi.fn<() => Promise<Response>>(
      async () => new Response(JSON.stringify(summary({ scheduled_maintenances: [] }))),
    )
    vi.stubGlobal("fetch", fetch)
    const { rerender } = render(<ServiceStatus pageUrl={PAGE} />)
    expect(screen.queryByRole("status")).toBeNull()
    expect(await screen.findByText("Panne de Connexion et données")).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(`${PAGE}/api/v2/summary.json`, expect.anything())
    expect(screen.getByRole("link", { name: /État du service/ }).getAttribute("href")).toBe(`${PAGE}/incidents/i1`)

    fireEvent.click(screen.getByRole("button", { name: "Masquer jusqu'à la prochaine mise à jour" }))
    expect(screen.queryByText("Panne de Connexion et données")).toBeNull()
    // Même version relue : reste fermé.
    rerender(<ServiceStatus pageUrl={null} />)
    rerender(<ServiceStatus pageUrl={PAGE} />)
    await act(async () => {})
    expect(screen.queryByText("Panne de Connexion et données")).toBeNull()
  })

  it("une lecture ratée n'affiche rien : jamais de fausse alerte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erreur", { status: 503 })),
    )
    render(<ServiceStatus pageUrl={PAGE} />)
    await act(async () => {})
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("sans adresse : aucune lecture", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal("fetch", fetchMock)
    render(<ServiceStatus pageUrl={null} />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
