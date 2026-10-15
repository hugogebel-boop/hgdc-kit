import { describe, expect, it, vi } from "vitest"

import type { sendErrorReport } from "./index.ts"
import { createErrorReporter } from "./server.ts"

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
