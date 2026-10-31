import type { Element, ElementContent, Root, RootContent } from "hast"

/**
 * Mise en forme du contenu, au build.
 *
 * Titre d'endpoint (`## GET /v9/projects`) en barre de méthode : la méthode en pastille
 * colorée, le chemin en police mono, ses paramètres (`:id`, `{id}`) soulignés. Le texte du
 * titre ne change pas : l'ancre, la table des matières et la recherche restent les mêmes.
 * Tableau : enveloppé dans `.hd-table`, qui défile en largeur sans déborder de la colonne.
 */
const ENDPOINT = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*)$/
const PARAM = /(:[A-Za-z_][\w]*|\{[^}/]+\})/

export function parseEndpoint(text: string): { method: string; path: string } | null {
  const match = ENDPOINT.exec(text.trim())
  return match ? { method: match[1]!, path: match[2]! } : null
}

function textOf(node: Element): string | null {
  let text = ""
  for (const child of node.children) {
    if (child.type === "text") text += child.value
    else if (child.type === "element" && child.tagName === "code") {
      for (const inner of child.children) if (inner.type === "text") text += inner.value
    } else return null
  }
  return text
}

function pathChildren(path: string): Array<ElementContent> {
  return path
    .split(PARAM)
    .filter(Boolean)
    .map((part) =>
      PARAM.test(part)
        ? {
            type: "element",
            tagName: "span",
            properties: { className: ["hd-path__param"] },
            children: [{ type: "text", value: part }],
          }
        : { type: "text", value: part },
    )
}

export function rehypeDocsContent() {
  const walk = (nodes: Array<RootContent | ElementContent>) => {
    for (const [index, node] of nodes.entries()) {
      if (node.type !== "element") continue
      // Tableau : un cadre qui défile seul en largeur, le tableau garde toute la largeur.
      if (node.tagName === "table") {
        nodes[index] = { type: "element", tagName: "div", properties: { className: ["hd-table"] }, children: [node] }
        continue
      }
      if (node.tagName !== "h2" && node.tagName !== "h3") {
        walk(node.children)
        continue
      }
      const text = textOf(node)
      const endpoint = text ? parseEndpoint(text) : null
      if (!endpoint) continue
      node.properties.className = [...((node.properties.className as Array<string>) ?? []), "hd-endpoint"]
      node.children = [
        {
          type: "element",
          tagName: "span",
          properties: { className: ["hd-method"], dataMethod: endpoint.method.toLowerCase() },
          children: [{ type: "text", value: endpoint.method }],
        },
        { type: "text", value: " " },
        {
          type: "element",
          tagName: "code",
          properties: { className: ["hd-path"] },
          children: pathChildren(endpoint.path),
        },
      ]
    }
  }
  // Typé en `unknown` : Astro et ce paquet ne résolvent pas toujours le même @types/hast.
  return (tree: unknown) => walk((tree as Root).children)
}
