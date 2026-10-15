// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest"

import { createBrowserReporter } from "./browser.ts"

const DSN = "https://cle@errors.example.net/5"

function setup(options: { dsn?: string | undefined; maxPerPage?: number } = {}) {
  const bodies: string[] = []
  const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) => {
    bodies.push(typeof init.body === "string" ? init.body : "")
    return new Response(null, { status: 200 })
  })
  const reporter = createBrowserReporter({ dsn: "dsn" in options ? options.dsn : DSN, fetchImpl, ...options })
  const events = () => bodies.map((body) => JSON.parse(body.split("\n")[2] ?? "{}"))
  return { reporter, fetchImpl, events }
}

describe("createBrowserReporter", () => {
  it("envoie le chemin sans la requête, nettoyé", async () => {
    window.history.pushState({}, "", `/partage/${"t".repeat(40)}?token=secret`)
    const { reporter, events } = setup()
    reporter.report("route", new Error("boom"), { section: "factures" })
    await vi.waitFor(() => expect(events()).toHaveLength(1))
    const [event] = events()
    expect(event.extra).toMatchObject({ path: "/partage/[jeton]", section: "factures" })
    expect(JSON.stringify(event)).not.toContain("secret")
    expect(event).toMatchObject({ platform: "javascript", server_name: window.location.hostname })
  })

  it("est éteint sans DSN", () => {
    const { reporter, fetchImpl } = setup({ dsn: undefined })
    reporter.report("route", new Error("boom"))
    reporter.install()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("n'envoie qu'une fois la même erreur, et au plus maxPerPage erreurs", () => {
    const { reporter, fetchImpl } = setup({ maxPerPage: 2 })
    reporter.report("a", new Error("même"))
    reporter.report("a", new Error("même"))
    reporter.report("b", new Error("autre"))
    reporter.report("c", new Error("encore"))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("tait les ConvexError", () => {
    const { reporter, fetchImpl } = setup()
    reporter.report("mutation", Object.assign(new Error("Adresse déjà prise"), { name: "ConvexError" }))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("écoute les erreurs non rattrapées, une seule fois", () => {
    const { reporter, fetchImpl } = setup()
    const listen = vi.spyOn(window, "addEventListener")
    reporter.install()
    reporter.install()
    expect(listen.mock.calls.map(([type]) => type)).toEqual(["error", "unhandledrejection"])
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("non rattrapée"), message: "non rattrapée" }))
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
