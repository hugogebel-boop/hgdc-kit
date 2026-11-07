import { describe, expect, it } from "vitest"

import { activeCoreProject, coreSwitcherShown, projectDestination, shellProjectFrom } from "./shell-project.tsx"

const projects = [
  { id: "p1", name: "Boutique", modules: ["host", "status"] },
  { id: "p2", name: "Blog", modules: ["analytics"] },
]

describe("projet choisi", () => {
  it("retombe sur tous les projets si le projet n'existe plus", () => {
    expect(activeCoreProject(projects, "p1")?.name).toBe("Boutique")
    expect(activeCoreProject(projects, "parti")).toBeNull()
    expect(activeCoreProject(undefined, "p1")).toBeNull()
    expect(activeCoreProject(projects, null)).toBeNull()
  })

  it("donne à la coque les modules du projet et le lien de ses réglages", () => {
    expect(shellProjectFrom(null, "/x")).toBeUndefined()
    expect(shellProjectFrom(projects[0]!, "/x")).toEqual({
      name: "Boutique",
      modules: ["host", "status"],
      settingsHref: "/x",
    })
  })
})

describe("un seul sélecteur", () => {
  it("montre celui de Basalte dès que l'organisation a des projets, ou pendant le chargement", () => {
    expect(coreSwitcherShown("o1", [{ id: "p1", name: "Boutique", modules: [] }])).toBe(true)
    expect(coreSwitcherShown("o1", undefined)).toBe(true)
    expect(coreSwitcherShown("o1", [])).toBe(false)
    expect(coreSwitcherShown(undefined, undefined)).toBe(false)
  })
})

describe("projectDestination", () => {
  const one = { id: "a", coreProjectId: "p1" }
  const two = { id: "b", coreProjectId: "p2" }
  const three = { id: "c", coreProjectId: "p2" }
  const free = { id: "d", coreProjectId: null }
  const all = [one, two, three, free]

  it("ouvre la seule ressource du projet", () => {
    expect(projectDestination(all, "p1", false)).toEqual({ to: "resource", resource: one })
    expect(projectDestination(all, "p1", true)).toEqual({ to: "resource", resource: one })
  })

  it("mène à la liste filtrée si le projet en a plusieurs ou aucune", () => {
    expect(projectDestination(all, "p2", true)).toEqual({ to: "list" })
    expect(projectDestination(all, "vide", true)).toEqual({ to: "list" })
    expect(projectDestination(all, "p2", false)).toBeNull()
    expect(projectDestination(all, "vide", false)).toBeNull()
  })

  it("« Tous les projets » quitte la ressource, sans bouger depuis la liste", () => {
    expect(projectDestination(all, null, true)).toEqual({ to: "list" })
    expect(projectDestination(all, null, false)).toBeNull()
  })

  it("ne bouge pas tant que la liste n'est pas chargée", () => {
    expect(projectDestination(undefined, "p1", true)).toBeNull()
  })
})
