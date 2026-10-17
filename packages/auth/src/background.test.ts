import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { HGDC_BACKGROUND_REFRESH_PATH, HGDC_ENTRY_REFRESH_BACKGROUND, HGDC_ORG_SYNC_COOKIE } from "./index.ts"

// `@hgdc/ui` ne dépend pas de `@hgdc/auth` : la coque recopie ces noms (`product-switch.ts`).
describe("relecture en arrière-plan : mêmes noms que la coque de @hgdc/ui", () => {
  const ui = readFileSync(new URL("../../ui/src/product-switch.ts", import.meta.url), "utf8")
  const products = readFileSync(new URL("../../ui/src/products.ts", import.meta.url), "utf8")

  it("cookie, cadre et paramètre", () => {
    expect(ui).toContain(`export const ORG_SYNC_COOKIE = "${HGDC_ORG_SYNC_COOKIE}"`)
    expect(ui).toContain(`export const BACKGROUND_REFRESH_PATH = "${HGDC_BACKGROUND_REFRESH_PATH}"`)
    expect(ui).toContain(`hgdc?refresh=${HGDC_ENTRY_REFRESH_BACKGROUND}*`)
    expect(products).toContain(`PRODUCT_ENTRY_REFRESH_QUERY = "refresh=${HGDC_ENTRY_REFRESH_BACKGROUND}&next=/"`)
  })
})
