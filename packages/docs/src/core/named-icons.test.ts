import lucide from "@iconify-json/lucide/icons.json" with { type: "json" }
import { describe, expect, it } from "vitest"

import { namedIconSvg, resolveIcon, type IconSet } from "./named-icons"

const set = lucide as IconSet

describe("icônes nommées", () => {
  it("trouve une icône Lucide par son nom", () => {
    expect(resolveIcon(set, "rocket")).toBe("rocket")
    expect(namedIconSvg(set, "rocket", 20)).toMatch(
      /^<svg class="hd-named-icon" aria-hidden="true" width="20" height="20"/,
    )
  })

  it("accepte les noms Font Awesome de Mintlify qui ont un équivalent", () => {
    expect(resolveIcon(set, "circle-info")).toBe("info")
    expect(resolveIcon(set, "magnifying-glass")).toBe("search")
    expect(resolveIcon(set, "fa-gear")).toBe("settings")
  })

  it("ne rend rien pour un nom inconnu ou vide", () => {
    expect(namedIconSvg(set, "nexiste-pas")).toBeNull()
    expect(namedIconSvg(set, "")).toBeNull()
    expect(namedIconSvg(set, undefined)).toBeNull()
  })

  it("chaque équivalent Font Awesome existe dans le jeu", () => {
    for (const name of ["triangle-exclamation", "pen-to-square", "user-group", "robot", "puzzle-piece", "list-check"])
      expect(resolveIcon(set, name), name).not.toBeNull()
  })
})
