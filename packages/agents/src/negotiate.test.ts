import { expect, test } from "vitest"

import { prefersMarkdown, varyOnAccept } from "./negotiate"

test.each([
  ["text/markdown", true],
  ["text/markdown, text/html;q=0.9", true],
  ["text/html, text/markdown", true],
  ["TEXT/MARKDOWN; charset=utf-8", true],
  ["text/html, text/markdown;q=0.5", false],
  ["text/markdown;q=0", false],
  ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", false],
  ["*/*", false],
  ["text/*", false],
  ["", false],
  [null, false],
])("prefersMarkdown(%j) = %s", (accept, expected) => {
  expect(prefersMarkdown(accept)).toBe(expected)
})

test("varyOnAccept ajoute Accept une seule fois", () => {
  const headers = new Headers()
  varyOnAccept(headers)
  expect(headers.get("vary")).toBe("Accept")
  const encoded = new Headers({ vary: "Accept-Encoding" })
  varyOnAccept(encoded)
  varyOnAccept(encoded)
  expect(encoded.get("vary")).toBe("Accept-Encoding, Accept")
  const any = new Headers({ vary: "*" })
  varyOnAccept(any)
  expect(any.get("vary")).toBe("*")
})
