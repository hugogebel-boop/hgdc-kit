import { afterEach, describe, expect, it, vi } from "vitest"

import { deploymentName, reportServerError } from "./convex.ts"

const DSN = "https://cle@errors.example.net/3"

afterEach(() => {
  vi.restoreAllMocks()
})

function glitchtip(status = 200) {
  const bodies: string[] = []
  const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) => {
    bodies.push(typeof init.body === "string" ? init.body : "")
    return new Response(null, { status })
  })
  return { bodies, fetchImpl }
}

describe("deploymentName", () => {
  it("garde le nom du déploiement Convex", () => {
    expect(deploymentName("https://hip-monitor-87.convex.cloud")).toBe("hip-monitor-87")
    expect(deploymentName(undefined)).toBe("convex")
  })
})

describe("reportServerError", () => {
  it("est éteint sans GLITCHTIP_DSN", async () => {
    const { fetchImpl } = glitchtip()
    expect(await reportServerError("github", new Error("boom"), undefined, { env: {}, fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("poste un événement node au nom du déploiement, avec la version", async () => {
    const { bodies, fetchImpl } = glitchtip()
    const env = {
      GLITCHTIP_DSN: DSN,
      CONVEX_CLOUD_URL: "https://hip-monitor-87.convex.cloud",
      GLITCHTIP_RELEASE: "abc",
    }
    expect(await reportServerError("github", new Error("boom"), { status: 502 }, { env, fetchImpl })).toBe(true)
    const event = JSON.parse(bodies[0]?.split("\n")[2] ?? "{}")
    expect(event).toMatchObject({ platform: "node", server_name: "hip-monitor-87", release: "abc" })
    expect(event.extra.status).toBe(502)
  })

  it("ne remonte pas une ConvexError", async () => {
    const { fetchImpl } = glitchtip()
    const error = Object.assign(new Error("Domaine déjà utilisé"), { name: "ConvexError" })
    expect(await reportServerError("domains", error, undefined, { env: { GLITCHTIP_DSN: DSN }, fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("prévient dans les journaux quand GlitchTip refuse, sans lever", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { fetchImpl } = glitchtip(500)
    expect(await reportServerError("x", new Error("boom"), undefined, { env: { GLITCHTIP_DSN: DSN }, fetchImpl })).toBe(
      false,
    )
    expect(warn).toHaveBeenCalledOnce()
  })
})
