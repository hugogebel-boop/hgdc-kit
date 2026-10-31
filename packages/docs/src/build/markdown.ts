import type { Element, Root } from "hast"
import { select, selectAll } from "hast-util-select"
import { toString } from "hast-util-to-string"
import rehypeParse from "rehype-parse"
import rehypeRemark from "rehype-remark"
import remarkGfm from "remark-gfm"
import remarkStringify from "remark-stringify"
import { unified } from "unified"

/**
 * Page construite (HTML) → Markdown propre, pour `.md`, `llms-full.txt` et le corpus.
 *
 * On part du HTML final plutôt que du MDX source : les composants (encadrés, onglets,
 * étapes) sont déjà rendus, et ce que lit l'agent est exactement ce que voit le visiteur.
 */
const REMOVED = [
  "script",
  "style",
  "template",
  "button",
  ".sl-anchor-link",
  "[data-hgdc-skip]",
  ".expressive-code .copy",
  "starlight-tabs [role=tablist]",
]

export function htmlToMarkdown(html: string): string {
  const tree = unified().use(rehypeParse).parse(html) as Root
  const content = select(".sl-markdown-content", tree) ?? select("main", tree)
  if (!content) return ""
  replaceCodeBlocks(content)
  replaceAsides(content)
  for (const selector of REMOVED) for (const node of selectAll(selector, content)) remove(content, node)

  const root: Root = { type: "root", children: content.children }
  const mdast = unified().use(rehypeRemark).runSync(root)
  const markdown = unified()
    .use(remarkGfm)
    .use(remarkStringify, { bullet: "-", fences: true, rule: "-" })
    .stringify(mdast)
  return String(markdown)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Expressive Code découpe le code en une ligne par élément ; le texte exact, sauts de ligne
 * compris, est dans `data-code` du bouton Copier (saut de ligne codé U+007F).
 */
function replaceCodeBlocks(content: Element): void {
  for (const figure of selectAll(".expressive-code", content)) {
    const code = select("[data-code]", figure)?.properties["dataCode"]
    const language = select("pre[data-language]", figure)?.properties["dataLanguage"]
    if (typeof code !== "string") continue
    const pre: Element = {
      type: "element",
      tagName: "pre",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "code",
          properties:
            typeof language === "string" && language !== "plaintext" ? { className: [`language-${language}`] } : {},
          children: [{ type: "text", value: code.replaceAll("\u007f", "\n") }],
        },
      ],
    }
    Object.assign(figure, pre)
  }
}

/**
 * Encadré → citation dont la première ligne porte le titre en gras : `> **Note**`. Le titre
 * est celui de la page, sinon le nom du type (`aria-label` de `.hd-callout`).
 */
function replaceAsides(content: Element): void {
  for (const aside of selectAll("aside.starlight-aside, aside.hd-callout", content)) {
    const title = select(".starlight-aside__title, .hd-callout__title", aside)
    const body = select(".starlight-aside__content, .hd-callout__body", aside)
    if (body && title) body.children = body.children.filter((child) => child !== title)
    const named = typeof aside.properties["ariaLabel"] === "string" ? aside.properties["ariaLabel"] : ""
    const label = title ? toString(title as Parameters<typeof toString>[0]).trim() : named
    const quote: Element = {
      type: "element",
      tagName: "blockquote",
      properties: {},
      children: [
        ...(label
          ? [
              {
                type: "element" as const,
                tagName: "p",
                properties: {},
                children: [
                  {
                    type: "element" as const,
                    tagName: "strong",
                    properties: {},
                    children: [{ type: "text" as const, value: label }],
                  },
                ],
              },
            ]
          : []),
        ...(body?.children ?? []),
      ],
    }
    Object.assign(aside, quote)
  }
  for (const title of selectAll(".hgdc-step__title", content)) {
    title.children = [{ type: "element", tagName: "strong", properties: {}, children: [...title.children] }]
  }
}

function remove(parent: Element | Root, target: Element): void {
  parent.children = parent.children.filter((child) => child !== target)
  for (const child of parent.children) if (child.type === "element") remove(child, target)
}
