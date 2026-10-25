import { afterEach, describe, expect, test, vi } from "vitest"

import { registerSiteTools, sitePagePath, siteTools } from "./webmcp"

const options = { prefix: "portal", name: "Portal", info: { llms: "https://portal.hgdc.ch/llms.txt" } }

describe("WebMCP", () => {
  afterEach(() => vi.unstubAllGlobals())

  test("chemins : jumeau Markdown sur le site, rien au dehors", () => {
    expect(sitePagePath("/")).toBe("/index.md")
    expect(sitePagePath("/docs")).toBe("/docs.md")
    expect(sitePagePath("/", "/mail")).toBe("/mail/index.md")
    expect(sitePagePath("/mail/docs", "/mail")).toBe("/mail/docs.md")
    for (const bad of ["https://evil.example/", "//evil.example", "/a?b", "/a\\b", 42, undefined])
      expect(sitePagePath(bad), String(bad)).toBeNull()
  })

  test("deux outils en lecture seule : infos et page en Markdown", async () => {
    const seen: string[] = []
    const tools = siteTools(options, async (path) => {
      seen.push(path)
      return new Response(path === "/docs.md" ? "# Docs" : "", { status: path === "/docs.md" ? 200 : 404 })
    })
    expect(tools.map((t) => t.name)).toEqual(["portal_infos", "portal_page"])
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true)
    expect(await tools[0]!.execute({})).toEqual(options.info)
    expect(await tools[1]!.execute({ chemin: "/docs" })).toEqual({ chemin: "/docs", markdown: "# Docs" })
    expect(await tools[1]!.execute({ chemin: "/nope" })).toMatchObject({ erreur: expect.stringContaining("404") })
    expect(await tools[1]!.execute({ chemin: "https://evil.example" })).toHaveProperty("erreur")
    expect(seen).toEqual(["/docs.md", "/nope.md"])
  })

  test("inscription : document.modelContext, sinon navigator.modelContext, sinon rien", async () => {
    const registered: string[] = []
    vi.stubGlobal("document", { modelContext: { registerTool: (t: { name: string }) => registered.push(t.name) } })
    vi.stubGlobal("navigator", {})
    registerSiteTools(options)
    await new Promise((r) => setTimeout(r, 0))
    expect(registered).toEqual(["portal_infos", "portal_page"])

    vi.stubGlobal("document", {})
    vi.stubGlobal("navigator", {
      modelContext: {
        registerTool: () => {
          throw new Error("déjà inscrit")
        },
      },
    })
    expect(() => registerSiteTools(options)).not.toThrow()
    vi.stubGlobal("navigator", {})
    expect(() => registerSiteTools(options)).not.toThrow()
  })
})
