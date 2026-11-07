import { describe, expect, it } from "vitest"

import { activeCoreProject, shellProjectFrom } from "./shell-project.tsx"

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
