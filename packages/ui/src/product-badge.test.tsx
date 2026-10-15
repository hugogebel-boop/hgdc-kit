// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AccountMenu } from "./account-menu.tsx"
import { FAMILY_MARK_SVG, FAMILY_PRODUCTS, PRODUCT_BADGE_SVG } from "./family-svg.ts"
import { FamilyMark, PRODUCT_GRADIENT, ProductBadge } from "./product-badge.tsx"
import { HGDC_ACCOUNT, HGDC_PRODUCTS, productMenuEntries } from "./products.ts"

afterEach(cleanup)

// happy-dom remplace `URL` : chemins de fichiers par node:path.
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const file = (name: string) =>
  readFileSync(join(root, "family", `${name}.svg`), "utf8")
    .replace(/\r\n/g, "\n")
    .trim()
const css = readFileSync(join(root, "styles.css"), "utf8")

describe("identité H family", () => {
  it("embarque les pastilles telles que les fichiers de family/ (régénérer : bun scripts/family.ts)", () => {
    for (const product of FAMILY_PRODUCTS) expect(PRODUCT_BADGE_SVG[product]).toBe(file(product))
    expect(FAMILY_MARK_SVG).toBe(file("hfamily-icon"))
  })

  it("garde le même dégradé dans la pastille, PRODUCT_GRADIENT et les jetons", () => {
    for (const product of FAMILY_PRODUCTS) {
      const { from, to } = PRODUCT_GRADIENT[product]
      expect(PRODUCT_BADGE_SVG[product]).toContain(`stop-color="${from}"`)
      expect(PRODUCT_BADGE_SVG[product]).toContain(`stop-color="${to}"`)
      expect(css).toContain(`--product-${product}-from: ${from};`)
      expect(css).toContain(`--product-${product}-to: ${to};`)
    }
  })

  it("donne une pastille à chaque produit du catalogue et à chaque entrée du menu", () => {
    for (const product of [HGDC_ACCOUNT, ...HGDC_PRODUCTS]) expect(product.badge).toBe(product.word.toLowerCase())
    for (const entry of productMenuEntries()) expect(entry.badge).toBeDefined()
  })

  it("rend une image décorative, ou nommée avec label", () => {
    const { container } = render(
      <>
        <ProductBadge product="host" />
        <FamilyMark label="H family" />
      </>,
    )
    const [badge, mark] = [...container.querySelectorAll("img")]
    expect(badge?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/)
    expect(badge?.getAttribute("alt")).toBe("")
    expect(badge?.getAttribute("aria-hidden")).toBe("true")
    expect(mark?.getAttribute("alt")).toBe("H family")
    expect(mark?.hasAttribute("aria-hidden")).toBe(false)
  })

  it("affiche la pastille des produits dans le menu du compte", async () => {
    render(
      <AccountMenu
        user={{ name: "Hugo Gebel", email: "hugo@example.ch" }}
        onSignOut={() => {}}
        products={productMenuEntries({ current: "Mail" })}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Compte de Hugo Gebel" }))
    const status = await screen.findByRole("menuitem", { name: "HGDC Status" })
    expect(status.querySelector("img")?.getAttribute("src")).toBe(
      `data:image/svg+xml,${encodeURIComponent(PRODUCT_BADGE_SVG.status)}`,
    )
  })
})
