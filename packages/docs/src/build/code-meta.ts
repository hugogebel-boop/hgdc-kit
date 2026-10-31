import type { ExpressiveCodePlugin } from "@astrojs/starlight/expressive-code"

import { parseCodeMeta } from "../core/code-meta.ts"

/**
 * Les options de bloc de code de Mintlify (`core/code-meta.ts`) dans Expressive Code : le nom de
 * fichier devient le titre du cadre, `wrap` le retour à la ligne, et `lines`, `expandable`,
 * `nocopy` des attributs du cadre que dessinent `styles/content.css` et `widget/code.ts`.
 */
export function mintlifyCodeMeta(): ExpressiveCodePlugin {
  return {
    name: "hgdc-code-meta",
    hooks: {
      preprocessMetadata: ({ codeBlock }) => {
        const meta = parseCodeMeta(codeBlock.meta)
        if (meta.title && !codeBlock.props.title) codeBlock.props.title = meta.title
        if (meta.wrap) codeBlock.props.wrap = true
      },
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        const meta = parseCodeMeta(codeBlock.meta)
        const properties = renderData.blockAst.properties
        if (meta.lines) properties.dataHdLines = ""
        if (meta.expandable) properties.dataHdExpandable = ""
        if (meta.nocopy) properties.dataHdNocopy = ""
      },
    },
  }
}
