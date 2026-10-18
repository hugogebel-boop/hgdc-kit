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

describe("identité H Collection", () => {
  it("embarque les icônes telles que les fichiers de family/tile/ (régénérer : bun scripts/family.ts)", () => {
    for (const product of FAMILY_PRODUCTS) {
      expect(PRODUCT_BADGE_SVG[product]).toBe(file(`tile/${product}`))
      // Le dessin clair, tel quel, sur un carré blanc arrondi (rx 14/64), la seule forme partout.
      const picto = file(product)
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>$/, "")
      expect(PRODUCT_BADGE_SVG[product]).toContain(picto)
      expect(PRODUCT_BADGE_SVG[product]).toContain('<rect width="64" height="64" rx="14" fill="#fff"/>')
      expect(PRODUCT_BADGE_SVG[product]).not.toMatch(/<circle cx="32" cy="32" r="32"|<path d="M32 0C/)
      // Pictogramme à 12 % de marge de chaque côté (7.68 sur 64), ADR 0017.
      expect(PRODUCT_BADGE_SVG[product]).toContain('<svg x="7.68" y="7.68" width="48.64" height="48.64"')
    }
    expect(FAMILY_MARK_SVG.light).toBe(file("hcollection-icon"))
    expect(FAMILY_MARK_SVG.dark).toBe(file("hcollection-icon-dark"))
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
        <ProductBadge product="mail" label="Mail" />
        <FamilyMark label="H Collection" />
      </>,
    )
    const [badge, named] = [...container.querySelectorAll('[data-slot="product-badge"]')]
    const mark = container.querySelector('[data-slot="family-mark"]')
    expect(badge?.getAttribute("src")).toBe(`data:image/svg+xml,${encodeURIComponent(PRODUCT_BADGE_SVG.host)}`)
    expect(badge?.getAttribute("alt")).toBe("")
    expect(badge?.getAttribute("aria-hidden")).toBe("true")
    expect(named?.getAttribute("src")).toBe(`data:image/svg+xml,${encodeURIComponent(PRODUCT_BADGE_SVG.mail)}`)
    expect(named?.getAttribute("alt")).toBe("Mail")
    // Le H garde ses deux variantes, sans fond.
    expect([...(mark?.querySelectorAll("img") ?? [])].map((img) => img.getAttribute("data-mark-theme"))).toEqual([
      "light",
      "dark",
    ])
    expect(mark?.getAttribute("role")).toBe("img")
    expect(mark?.getAttribute("aria-label")).toBe("H Collection")
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
    const status = await screen.findByRole("menuitem", { name: "Status" })
    expect(status.querySelector("img")?.getAttribute("src")).toBe(
      `data:image/svg+xml,${encodeURIComponent(PRODUCT_BADGE_SVG.status)}`,
    )
  })
})
