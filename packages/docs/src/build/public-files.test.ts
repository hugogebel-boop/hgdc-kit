// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { publicFiles } from "./public-files.ts"

describe("fichiers publiés", () => {
  it("ne publie que le déclaré, les médias des dossiers d'images et public/", () => {
    const dir = mkdtempSync(join(tmpdir(), "hgdc-docs-"))
    for (const path of [
      "images/a.png",
      "images/notes.txt",
      "logo/l.svg",
      "secret.txt",
      "contrat.pdf",
      "favicon.svg",
      "public/robots.txt",
      "brouillons/x.png",
    ]) {
      mkdirSync(join(dir, path, ".."), { recursive: true })
      writeFileSync(join(dir, path), "x")
    }
    const published = publicFiles(dir, ["/favicon.svg", "/../dehors.svg"]).map((file) => file.to.replaceAll("\\", "/"))
    expect(published.sort()).toEqual(["favicon.svg", "images/a.png", "logo/l.svg", "robots.txt"])
  })
})
