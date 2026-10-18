import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { APP_ICON_FILES, appIconCopies, emailIconCopies, runCopies } from "./brand.ts"
import { EMAIL_ICON_VERSION, FAMILY_PRODUCTS } from "./family-svg.ts"

describe("hgdc-brand", () => {
  it("chaque produit a toutes ses icônes d'application et son icône d'e-mail dans le paquet", () => {
    for (const product of FAMILY_PRODUCTS) {
      for (const { from } of appIconCopies(product, "public", ["legacy.png"])) expect(existsSync(from), from).toBe(true)
    }
    for (const { from } of emailIconCopies("email")) expect(existsSync(from), from).toBe(true)
  })

  it("l'empreinte de chaque icône d'e-mail suit son image (bun scripts/family.ts relancé)", () => {
    for (const { from } of emailIconCopies("email")) {
      const product = from.replace(/^.*[\\/]/, "").replace(".png", "") as keyof typeof EMAIL_ICON_VERSION
      const hash = createHash("sha256").update(readFileSync(from)).digest("hex").slice(0, 8)
      expect(EMAIL_ICON_VERSION[product]).toBe(hash)
    }
  })

  it("pose les icônes du produit, et son icône d'e-mail sous les anciens noms", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hgdc-brand-"))
    await runCopies(appIconCopies("mail", dir, ["hgdc-mark.png"]))
    expect(readdirSync(dir).sort()).toEqual([...APP_ICON_FILES, "hgdc-mark.png"].sort())
    expect(readFileSync(join(dir, "hgdc-mark.png"))).toEqual(
      readFileSync(emailIconCopies(dir).find(({ to }) => to.endsWith("mail.png"))!.from),
    )
  })

  it("refuse un produit inconnu et un nom qui sortirait du dossier", () => {
    expect(() => appIconCopies("stratta", "public")).toThrow(/produit inconnu/)
    expect(() => appIconCopies("mail", "public", ["../escape.png"])).toThrow(/nom de fichier invalide/)
  })
})
