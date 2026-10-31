import { describe, expect, it } from "vitest"

import { formatCodeMeta, parseCodeMeta } from "./code-meta"

describe("parseCodeMeta", () => {
  it("lit un nom de fichier nu et les options de Mintlify", () => {
    expect(parseCodeMeta("app/page.tsx lines wrap expandable nocopy")).toEqual({
      title: "app/page.tsx",
      lines: true,
      wrap: true,
      expandable: true,
      nocopy: true,
      rest: [],
    })
  })

  it("garde un titre en plusieurs mots, ou entre guillemets", () => {
    expect(parseCodeMeta("Mon fichier.js").title).toBe("Mon fichier.js")
    expect(parseCodeMeta('title="Le terminal" lines').title).toBe("Le terminal")
  })

  it("garde tel quel ce qui appartient à d'autres outils", () => {
    const meta = parseCodeMeta('{1-3} ins={4} twoslash config.json /regex/ frame="none"')
    expect(meta.title).toBe("config.json")
    expect(meta.rest).toEqual(["{1-3}", "ins={4}", "twoslash", "/regex/", 'frame="none"'])
  })

  it("rend une méta vide sans titre", () => {
    expect(parseCodeMeta(undefined)).toEqual(parseCodeMeta(""))
    expect(parseCodeMeta("").title).toBeNull()
  })
})

describe("formatCodeMeta", () => {
  it("se relit à l'identique", () => {
    for (const meta of ["index.ts lines wrap", 'title="lines" nocopy', "Terminal expandable {1-3}", ""]) {
      expect(parseCodeMeta(formatCodeMeta(parseCodeMeta(meta)))).toEqual(parseCodeMeta(meta))
    }
  })

  it("met entre guillemets un titre qui serait relu comme une option", () => {
    expect(formatCodeMeta({ ...parseCodeMeta(""), title: "wrap" })).toBe('title="wrap"')
    expect(formatCodeMeta({ ...parseCodeMeta(""), title: "a=b" })).toBe('title="a=b"')
  })

  it("écrit les options dans un ordre stable", () => {
    expect(formatCodeMeta({ ...parseCodeMeta("nocopy lines"), title: "x.ts" })).toBe("x.ts lines nocopy")
  })
})
