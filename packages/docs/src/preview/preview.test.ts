// @vitest-environment node
import { describe, expect, it } from "vitest"

import { isPublishedAsset } from "../build/public-files.ts"
import { parseDocsConfig, type DocsConfig } from "../core/config.ts"
import { isDocFile } from "../core/validate.ts"
import { needsRestart } from "./live.ts"
import { parseCloseRequest, parseSyncRequest } from "./protocol.ts"

function config(value: Record<string, unknown>): DocsConfig {
  const parsed = parseDocsConfig(JSON.stringify({ name: "Acme", navigation: { pages: ["index"] }, ...value }))
  if (!parsed.ok) throw new Error(parsed.errors.join())
  return parsed.config
}

describe("aperçu : rechargement de docs.json", () => {
  it("l'apparence se recharge, la structure redémarre", () => {
    const base = config({})
    expect(needsRestart(base, config({ colors: { primary: "#0e7490" } }))).toBe(false)
    expect(needsRestart(base, config({ name: "Acme 2", navbar: { links: [] } }))).toBe(false)
    expect(needsRestart(base, config({ navigation: { pages: ["index", "guide"] } }))).toBe(true)
    expect(needsRestart(base, config({ redirects: [{ source: "/a", destination: "/b" }] }))).toBe(true)
    expect(needsRestart(base, config({ favicon: "/images/f.svg" }))).toBe(true)
  })

  it("seules les images des dossiers publiés sont servies", () => {
    expect(isPublishedAsset("images/logo.svg")).toBe(true)
    expect(isPublishedAsset("public/robots.txt")).toBe(true)
    expect(isPublishedAsset("images/notes.txt")).toBe(false)
    expect(isPublishedAsset("secret.png")).toBe(false)
    expect(isPublishedAsset("images/.cache/x.png")).toBe(false)
  })
})

describe("aperçu : requête de synchronisation", () => {
  const key = "a".repeat(32)
  const ids = { key, owner: "b".repeat(64), organization: "c".repeat(64), project: "d".repeat(64) }
  it("accepte docs.json, pages et images", () => {
    const body = JSON.stringify({
      ...ids,
      repo: [{ path: "docs.json", sha: "x1" }],
      overlay: [{ path: "guides/a.mdx", sha: null }],
      blobs: [{ sha: "x1", encoding: "utf-8", content: "{}" }],
    })
    expect(parseSyncRequest(body, isDocFile).ok).toBe(true)
  })

  it("refuse un chemin hors de la doc ou une clé mal formée", () => {
    const bad = (overlay: unknown, k = key) =>
      parseSyncRequest(JSON.stringify({ ...ids, key: k, overlay, blobs: [] }), isDocFile)
    expect(bad([{ path: "../etc/passwd", sha: "x" }]).ok).toBe(false)
    expect(bad([{ path: ".env", sha: "x" }]).ok).toBe(false)
    expect(bad([{ path: "astro.config.mjs", sha: "x" }]).ok).toBe(false)
    expect(bad([{ path: "index.mdx", sha: "../../x" }]).ok).toBe(false)
    expect(bad([], "pas-une-cle").ok).toBe(false)
    expect(parseSyncRequest("{", isDocFile).ok).toBe(false)
    // Sans personne ni organisation, pas de plafond possible : refusé.
    expect(parseSyncRequest(JSON.stringify({ key, overlay: [], blobs: [] }), isDocFile).ok).toBe(false)
  })

  it("ne ferme que sur une empreinte de personne, d'organisation ou de projet", () => {
    expect(parseCloseRequest(JSON.stringify({ owner: "b".repeat(64) }))).toEqual({ owner: "b".repeat(64) })
    expect(parseCloseRequest(JSON.stringify({ owner: "bob" }))).toBeNull()
    expect(parseCloseRequest(JSON.stringify({}))).toBeNull()
  })
})
