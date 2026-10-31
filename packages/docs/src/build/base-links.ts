import type { Root } from "mdast"

import { withBase } from "../core/navigation.ts"

type Node = { type: string; url?: unknown; attributes?: unknown; children?: Array<Node> }
type Attribute = { type: string; name?: string; value?: unknown }

/** Attributs JSX qui portent une adresse : `<Card href>`, `<img src>`, `<a href>`, `<video poster>`. */
const URL_ATTRIBUTES = new Set(["href", "src", "poster"])

/**
 * Site servi sous un sous-chemin (`base: "/docs"`) : les liens et médias écrits depuis la
 * racine du site (`/guides/publier/`, `/images/x.png`) reçoivent le sous-chemin, dans le
 * Markdown (`[…](/…)`, `![…](/…)`, définitions) comme dans les composants MDX. Le rédacteur
 * écrit ses liens comme pour un site à la racine ; la doc reste déplaçable.
 */
export function remarkBaseLinks(options: { base: string }) {
  const { base } = options
  return (tree: Root) => {
    if (!base) return
    const walk = (node: Node) => {
      if (typeof node.url === "string") node.url = withBase(base, node.url)
      // Les directives (`:::note{…}`) portent un objet d'attributs : seuls ceux de JSX nous intéressent.
      for (const attribute of Array.isArray(node.attributes) ? (node.attributes as Array<Attribute>) : [])
        if (
          attribute.type === "mdxJsxAttribute" &&
          URL_ATTRIBUTES.has(attribute.name ?? "") &&
          typeof attribute.value === "string"
        )
          attribute.value = withBase(base, attribute.value)
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree as unknown as Node)
  }
}
