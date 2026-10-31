import type { Root } from "mdast"
import type { VFile } from "vfile"

import { MDX_COMPONENTS } from "../core/components.ts"

const SOURCE = "@hgdc/docs/components"

type EsmNode = { type: "mdxjsEsm"; value: string; data?: { estree?: { body?: Array<EstreeImport> } } }
type EstreeImport = { type: string; specifiers?: Array<{ local?: { name?: string } }> }

function declaredNames(tree: Root): Set<string> {
  const names = new Set<string>()
  for (const node of tree.children as unknown as Array<EsmNode>) {
    if (node.type !== "mdxjsEsm") continue
    for (const statement of node.data?.estree?.body ?? [])
      for (const specifier of statement.specifiers ?? []) if (specifier.local?.name) names.add(specifier.local.name)
  }
  return names
}

/** Import par défaut d'un fichier `.astro`, sous la forme ESTree qu'attend le compilateur MDX. */
function importNode(name: string): EsmNode {
  const source = `${SOURCE}/${name}.astro`
  const identifier = { type: "Identifier", name }
  return {
    type: "mdxjsEsm",
    value: `import ${name} from ${JSON.stringify(source)}`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [{ type: "ImportDefaultSpecifier", local: identifier }],
            source: { type: "Literal", value: source, raw: JSON.stringify(source) },
          },
        ],
      } as never,
    },
  }
}

/**
 * Ajoute en tête de chaque page MDX l'import des composants (`core/components.ts`) que la
 * page n'importe pas déjà elle-même : `<Note>`, `<Steps>`… s'écrivent sans `import`.
 */
export function remarkAutoImport() {
  return (tree: Root, file: VFile) => {
    if (!String(file.path ?? file.history.at(-1) ?? "").endsWith(".mdx")) return
    const declared = declaredNames(tree)
    const imports = MDX_COMPONENTS.filter((name) => !declared.has(name)).map(importNode)
    tree.children.unshift(...(imports as never[]))
  }
}
