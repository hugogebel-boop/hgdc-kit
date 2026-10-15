// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccessRequest, EMPTY_ACCESS_REQUEST, submitAccessRequest } from "./access-request.tsx"
import type { AccessRequestFetcher } from "./access-request.tsx"

afterEach(cleanup)

const ENDPOINT = "https://forms.example/f/abc123"
const reply = (status: number, body: unknown) =>
  vi.fn<AccessRequestFetcher>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  )

describe("submitAccessRequest", () => {
  it("poste en JSON avec le produit et le piège, et lit chaque réponse", async () => {
    const fetcher = reply(200, { ok: true })
    const values = { ...EMPTY_ACCESS_REQUEST, prenom: "Léa", email: "lea@atelier.ch" }
    expect(await submitAccessRequest(ENDPOINT, values, "Mail", { fetcher })).toEqual({ kind: "sent" })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ENDPOINT)
    expect((init.headers as Record<string, string>).Accept).toBe("application/json")
    expect(JSON.parse(init.body as string)).toMatchObject({ prenom: "Léa", produit: "Mail", _gotcha: "" })

    const invalid = reply(422, { ok: false, error: { code: "validation_error" }, errors: { email: "Invalide." } })
    expect(await submitAccessRequest(ENDPOINT, values, "Mail", { fetcher: invalid })).toEqual({
      kind: "invalid",
      errors: { email: "Invalide." },
    })
    const limited = reply(429, { ok: false, error: { code: "rate_limited" } })
    expect(await submitAccessRequest(ENDPOINT, values, "Mail", { fetcher: limited })).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("Réessaie dans une minute"),
    })
    const offline = vi.fn<AccessRequestFetcher>(async () => {
      throw new TypeError("Failed to fetch")
    })
    expect((await submitAccessRequest(ENDPOINT, values, "Mail", { fetcher: offline })).kind).toBe("failed")
  })
})

function fill() {
  fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Léa" } })
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Dupont" } })
  fireEvent.change(screen.getByLabelText("Entreprise"), { target: { value: "Atelier" } })
  fireEvent.change(screen.getByLabelText("E-mail professionnel"), { target: { value: "lea@atelier.ch" } })
}

describe("AccessRequest", () => {
  it("affiche la réussite avec l'adresse saisie", async () => {
    render(<AccessRequest endpoint={ENDPOINT} product="Host" fetcher={reply(200, { ok: true })} />)
    expect(screen.getByRole("heading", { name: "Demander un accès à Host" })).toBeTruthy()
    fill()
    fireEvent.submit(screen.getByRole("button", { name: "Envoyer la demande" }).closest("form")!)
    await waitFor(() => expect(screen.getByRole("heading", { name: "Demande envoyée" })).toBeTruthy())
    expect(screen.getByText(/lea@atelier\.ch/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Retour à l'accueil" }).getAttribute("href")).toBe("/")
  })

  it("marque le champ refusé par le serveur et dit pourquoi", async () => {
    const fetcher = reply(422, {
      ok: false,
      error: { code: "validation_error" },
      errors: { email: "Adresse invalide." },
    })
    render(<AccessRequest endpoint={ENDPOINT} product="Mail" fetcher={fetcher} />)
    fill()
    fireEvent.submit(screen.getByRole("button", { name: "Envoyer la demande" }).closest("form")!)
    await waitFor(() => expect(screen.getByText("Adresse invalide.")).toBeTruthy())
    expect(screen.getByLabelText("E-mail professionnel").getAttribute("aria-invalid")).toBe("true")
  })

  it("rend le lien de connexion du produit", () => {
    render(<AccessRequest endpoint={ENDPOINT} product="Mail" signInHref="/connexion" />)
    expect(screen.getByRole("link", { name: "Se connecter" }).getAttribute("href")).toBe("/connexion")
  })
})
