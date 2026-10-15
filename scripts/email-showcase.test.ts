import { describe, expect, it } from "vitest"

import { renderEmail } from "../packages/ui/src/email.tsx"
import { SHOWCASE } from "./email-showcase.tsx"

describe("vitrine des e-mails", () => {
  for (const [name, element] of Object.entries(SHOWCASE)) {
    it(`${name} : rendu complet, sans grand tiret, sous la coupure de Gmail`, async () => {
      const { html, text } = await renderEmail(element)
      expect(html.startsWith("<!DOCTYPE html")).toBe(true)
      // Gmail coupe un message au-delà de 102 ko.
      expect(html.length).toBeLessThan(60_000)
      expect(text.length).toBeGreaterThan(100)
      for (const output of [html, text]) {
        expect(output).not.toContain("—")
        expect(output).not.toContain("–")
      }
    })
  }
})
