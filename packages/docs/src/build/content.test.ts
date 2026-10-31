// @vitest-environment node
import type { Root } from "hast"
import rehypeParse from "rehype-parse"
import { unified } from "unified"
import { describe, expect, it } from "vitest"

import { safeExcerpt } from "../widget/excerpt.ts"
import { parseEndpoint, rehypeDocsContent } from "./content.ts"
import { htmlToMarkdown } from "./markdown.ts"

const parse = (html: string) => unified().use(rehypeParse, { fragment: true }).parse(html) as Root
const transform = (html: string) => {
  const tree = parse(html)
  rehypeDocsContent()(tree)
  return tree
}

describe("titres d'endpoint", () => {
  it("lit la méthode et le chemin, rien d'autre", () => {
    expect(parseEndpoint("GET /v9/projects")).toEqual({ method: "GET", path: "/v9/projects" })
    expect(parseEndpoint(" DELETE /v1/x/:id ")).toEqual({ method: "DELETE", path: "/v1/x/:id" })
    expect(parseEndpoint("Get started")).toBeNull()
    expect(parseEndpoint("GET des projets")).toBeNull()
  })

  it("devient une barre de méthode, paramètres marqués, texte du titre inchangé", () => {
    const tree = transform('<h2 id="get-v9projectsidorname">GET /v9/projects/:idOrName</h2>')
    const heading = tree.children[0] as Extract<Root["children"][number], { type: "element" }>
    expect(heading.properties["className"]).toContain("hd-endpoint")
    expect(heading.properties["id"]).toBe("get-v9projectsidorname")
    const text = (node: unknown): string => {
      const n = node as { value?: string; children?: Array<unknown> }
      return n.value ?? (n.children ?? []).map(text).join("")
    }
    expect(text(heading)).toBe("GET /v9/projects/:idOrName")
    expect(JSON.stringify(heading)).toContain("hd-path__param")
  })

  it("un titre ordinaire ne change pas", () => {
    const tree = transform("<h2>Erreurs</h2><h3>GET n'est pas seul</h3>")
    expect(JSON.stringify(tree)).not.toContain("hd-endpoint")
  })
})

describe("tableaux", () => {
  it("chaque tableau est enveloppé dans un cadre qui défile", () => {
    const tree = transform("<div><table><tr><td>a</td></tr></table></div>")
    expect(JSON.stringify(tree)).toContain('"hd-table"')
  })
})

describe("Markdown publié des encadrés", () => {
  it("un encadré garde son titre, ou le nom de son type, en gras", () => {
    const html = (title: string) =>
      `<main><div class="sl-markdown-content"><aside class="hd-callout" aria-label="${title || "Astuce"}"><svg></svg><div class="hd-callout__body">${title ? `<p class="hd-callout__title">${title}</p>` : ""}<p>Texte.</p></div></aside></div></main>`
    expect(htmlToMarkdown(html("Avant de commencer"))).toBe("> **Avant de commencer**\n>\n> Texte.")
    expect(htmlToMarkdown(html(""))).toBe("> **Astuce**\n>\n> Texte.")
  })
})

describe("extraits de recherche", () => {
  it("seul <mark> passe, tout autre balisage est échappé", () => {
    expect(safeExcerpt("un <mark>domaine</mark> <img src=x onerror=alert(1)>")).toBe(
      "un <mark>domaine</mark> &lt;img src=x onerror=alert(1)&gt;",
    )
  })
})
