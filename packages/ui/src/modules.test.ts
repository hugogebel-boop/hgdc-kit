import { describe, expect, it } from "vitest"

import {
  BASALTE_MODULES,
  DEFAULT_MODULE_BAR,
  hiddenModules,
  isModuleWord,
  moduleByWord,
  moveModule,
  parseModuleBar,
  shownModules,
} from "./modules.ts"
import { HGDC_PRODUCTS } from "./products.ts"

describe("modules de Basalte", () => {
  it("les noms sont ceux du catalogue, et la barre par défaut n'a que des modules connus", () => {
    for (const { word, name } of BASALTE_MODULES)
      expect(HGDC_PRODUCTS.find((product) => product.badge === word)?.name, word).toBe(name)
    expect(DEFAULT_MODULE_BAR.every(isModuleWord)).toBe(true)
  })

  it("reconnaît un mot de module, rien d'autre", () => {
    expect(isModuleWord("mail")).toBe(true)
    for (const value of ["manager", "portal", "iassistant", "Mail", 3, null, undefined])
      expect(isModuleWord(value)).toBe(false)
  })

  it("trouve un module par son mot, refuse un mot inconnu", () => {
    expect(moduleByWord("status").name).toBe("Surveillance")
    expect(() => moduleByWord("portal" as never)).toThrow("portal")
  })
})

describe("parseModuleBar", () => {
  it("garde les mots connus, dans l'ordre, sans doublon", () => {
    expect(parseModuleBar(["mail", "inconnu", "host", "mail", 3])).toEqual(["mail", "host"])
  })

  it("accepte une liste vide : tout masquer est un choix", () => {
    expect(parseModuleBar([])).toEqual([])
  })

  it("rend `null` si ce n'est pas une liste", () => {
    for (const value of [null, "mail", { 0: "mail" }, 1]) expect(parseModuleBar(value)).toBeNull()
  })
})

describe("shownModules", () => {
  it("ajoute à la fin le module ouvert s'il est masqué", () => {
    expect(shownModules(["host", "mail"], "docs")).toEqual(["host", "mail", "docs"])
  })

  it("ne déplace pas un module déjà présent, n'ajoute pas ce qui n'est pas un module", () => {
    expect(shownModules(["host", "mail"], "host")).toEqual(["host", "mail"])
    expect(shownModules(["host"], "manager")).toEqual(["host"])
    expect(shownModules(["host"])).toEqual(["host"])
  })

  it("ne modifie pas la liste reçue", () => {
    const order = Object.freeze(["host"] as const)
    expect(shownModules(order, "mail")).toEqual(["host", "mail"])
    expect(order).toEqual(["host"])
  })
})

describe("hiddenModules", () => {
  it("rend les absents dans l'ordre par défaut, quel que soit l'ordre de la barre", () => {
    expect(hiddenModules(["docs", "host", "analytics", "mail"]).map((item) => item.word)).toEqual(["status", "id"])
  })

  it("rend tout pour une barre vide, rien pour une barre complète", () => {
    expect(hiddenModules([])).toHaveLength(BASALTE_MODULES.length)
    expect(hiddenModules(BASALTE_MODULES.map((item) => item.word))).toEqual([])
  })
})

describe("moveModule", () => {
  it("déplace vers le haut et vers le bas", () => {
    expect(moveModule(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
    expect(moveModule(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"])
  })

  it("hors limites, rend une copie inchangée", () => {
    const list = ["a", "b"]
    for (const [from, to] of [
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 2],
    ] as const) {
      const moved = moveModule(list, from, to)
      expect(moved).toEqual(list)
      expect(moved).not.toBe(list)
    }
  })
})
