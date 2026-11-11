import { describe, expect, it, vi } from "vitest"

import type { sendErrorReport } from "./index.ts"
import { createErrorReporter, reportRequestFailure, routeShape } from "./server.ts"

const DSN = "http://cle@127.0.0.1:9102/6"
const IP = "203.0.113.42"
const TOKEN = "k".repeat(40)

/** Rapporteur dont les tâches différées sont gardées pour être lancées à la main. */
function harness(options: { perSourceMs?: number; perHour?: number } = {}) {
  let t = 1_000_000
  const tasks: (() => void)[] = []
  const send = vi.fn<typeof sendErrorReport>(async () => true)
  const report = createErrorReporter({
    dsn: DSN,
    now: () => t,
    send,
    defer: (task) => void tasks.push(task),
    ...options,
  })
  return {
    report,
    send,
    advance: (ms: number) => void (t += ms),
    flush: () => tasks.splice(0).forEach((task) => task()),
  }
}

describe("createErrorReporter", () => {
  it("est éteint sans DSN", () => {
    const send = vi.fn<typeof sendErrorReport>(async () => true)
    createErrorReporter({ dsn: undefined, send, defer: (task) => task() })("http", new Error("boom"))
    expect(send).not.toHaveBeenCalled()
  })

  it("rend la main avant tout envoi, même si GlitchTip ne répond jamais", () => {
    const send = vi.fn<typeof sendErrorReport>(() => new Promise<boolean>(() => {}))
    const tasks: (() => void)[] = []
    const report = createErrorReporter({ dsn: DSN, send, defer: (task) => void tasks.push(task) })
    expect(report("umami", new Error("Umami a répondu 502"))).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
    tasks.forEach((task) => task())
    expect(send).toHaveBeenCalledOnce()
  })

  it("diffère l'envoi par défaut au tour suivant de la boucle", async () => {
    const send = vi.fn<typeof sendErrorReport>(async () => true)
    createErrorReporter({ dsn: DSN, send })("http", new Error("boom"))
    expect(send).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  })

  it("ne lève jamais, même si l'envoi rejette", async () => {
    const send = vi.fn<typeof sendErrorReport>(async () => {
      throw new Error("réseau")
    })
    const report = createErrorReporter({ dsn: DSN, send, defer: (task) => task() })
    expect(() => report("http", new Error("boom"))).not.toThrow()
    await Promise.resolve()
  })

  it("une remontée par source et par minute, un plafond horaire en tout", () => {
    const h = harness({ perHour: 3 })
    h.report("umami", new Error("a"))
    h.report("umami", new Error("b"))
    h.report("convex", new Error("c"))
    h.flush()
    expect(h.send).toHaveBeenCalledTimes(2)
    h.advance(61_000)
    h.report("umami", new Error("d"))
    h.advance(61_000)
    h.report("purge", new Error("e"))
    h.flush()
    expect(h.send).toHaveBeenCalledTimes(3)
  })

  it("l'enveloppe ne contient ni IP, ni jeton, ni e-mail", async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) => {
      bodies.push(typeof init.body === "string" ? init.body : "")
      return new Response(null, { status: 200 })
    })
    const report = createErrorReporter({ dsn: DSN, fetchImpl, defer: (task) => task() })
    report("umami", new Error(`connect ECONNREFUSED ${IP}:3000 Bearer ${TOKEN} pour hugo@exemple.ch`), {
      route: "/e",
      status: 502,
    })
    await vi.waitFor(() => expect(bodies).toHaveLength(1))
    const body = bodies[0] ?? ""
    for (const secret of [IP, TOKEN, "hugo@exemple.ch"]) expect(body).not.toContain(secret)
    expect(body).toContain("[ip]")
    expect(body).toContain('"route":"/e"')
    expect(body).toContain('"platform":"node"')
  })
})

describe("routeShape", () => {
  it("retire identifiants et nom d'organisation, garde les mots de route", () => {
    expect(routeShape("/mail/o/acme-sa/emails/js721qy89mva52twm8rcfjnt9h8j14ap")).toBe("/mail/o/:org/emails/:id")
    expect(routeShape("/status/api/v1/monitors/42")).toBe("/status/api/v1/monitors/:id")
    expect(routeShape("/o/~demo")).toBe("/o/:org")
    expect(routeShape("/")).toBe("/")
    expect(routeShape("/a/b/c/d/e/f/g/h/i/j")).toBe("/a/b/c/d/e/f/g/h")
    expect(routeShape("/x/Jean.Dupont@exemple.ch")).toBe("/x/:id")
  })
})

describe("reportRequestFailure", () => {
  const request = { method: "GET", url: "https://app.exemple.ch/mail/o/acme/emails/abc123def456" }
  const calls = () => {
    const seen: Array<[string, unknown, unknown]> = []
    const report = (source: string, error: unknown, context?: unknown) => void seen.push([source, error, context])
    return { seen, report }
  }

  it("remonte une exception avec la forme de la route, puis la relance telle quelle", async () => {
    const { seen, report } = calls()
    const failure = new Error("base injoignable")
    await expect(
      reportRequestFailure(report, "front", request, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(seen).toEqual([["front", failure, { method: "GET", route: "/mail/o/:org/emails/:id" }]])
  })

  it("remonte une réponse 5xx avec son statut, rend la réponse intacte", async () => {
    const { seen, report } = calls()
    const response = new Response("oups", { status: 502 })
    const result = await reportRequestFailure(report, "front", request, async () => ({ response }))
    expect(result.response).toBe(response)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.[2]).toEqual({ method: "GET", route: "/mail/o/:org/emails/:id", status: 502 })
  })

  it("ne remonte ni une réponse 2xx à 4xx, ni une redirection ou une page introuvable lancée", async () => {
    const { seen, report } = calls()
    await reportRequestFailure(report, "front", request, async () => ({
      response: new Response(null, { status: 404 }),
    }))
    for (const thrown of [new Response(null, { status: 302 }), { isRedirect: true }, { isNotFound: true }])
      await expect(
        reportRequestFailure(report, "front", request, async () => {
          throw thrown
        }),
      ).rejects.toBe(thrown)
    expect(seen).toEqual([])
  })
})
