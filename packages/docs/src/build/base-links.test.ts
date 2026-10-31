// @vitest-environment node
import type { Root } from "mdast"
import { describe, expect, it } from "vitest"

import { remarkBaseLinks } from "./base-links.ts"

const tree = (): Root =>
  ({
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "link", url: "/guides/publier/", children: [] },
          { type: "link", url: "https://hgdc.ch/", children: [] },
          { type: "link", url: "#ancre", children: [] },
          { type: "image", url: "/images/capture.webp" },
        ],
      },
      { type: "definition", identifier: "a", url: "/reference/" },
      {
        type: "mdxJsxFlowElement",
        name: "Card",
        attributes: [
          { type: "mdxJsxAttribute", name: "title", value: "/pas-un-lien" },
          { type: "mdxJsxAttribute", name: "href", value: "/demarrer/" },
        ],
        children: [
          {
            type: "mdxJsxFlowElement",
            name: "img",
            attributes: [{ type: "mdxJsxAttribute", name: "src", value: "/images/host.svg" }],
            children: [],
          },
        ],
      },
    ],
  }) as unknown as Root

describe("liens sous un sous-chemin", () => {
  it("préfixe les liens, images et attributs d'adresse des composants", () => {
    const root = tree()
    remarkBaseLinks({ base: "/docs" })(root)
    const json = JSON.stringify(root)
    for (const expected of [
      "/docs/guides/publier/",
      "/docs/images/capture.webp",
      "/docs/reference/",
      "/docs/demarrer/",
      "/docs/images/host.svg",
    ])
      expect(json).toContain(`"${expected}"`)
    for (const untouched of ["https://hgdc.ch/", "#ancre", "/pas-un-lien"]) expect(json).toContain(`"${untouched}"`)
  })

  it("ne change rien à la racine", () => {
    const root = tree()
    remarkBaseLinks({ base: "" })(root)
    expect(root).toEqual(tree())
  })
})
