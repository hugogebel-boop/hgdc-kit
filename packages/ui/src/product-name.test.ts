import { describe, expect, it } from "vitest"

import { familyProductName } from "./product-name.ts"

describe("familyProductName", () => {
  it("affiche ID pour le compte, jamais Account", () => {
    expect(familyProductName("account")).toBe("ID")
  })

  it("affiche le nom du module pour un produit", () => {
    expect(familyProductName("host")).toBe("Déploiements")
  })
})
