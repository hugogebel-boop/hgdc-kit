import { docsSchema } from "@astrojs/starlight/schema"
import { glob } from "astro/loaders"
import { defineCollection } from "astro:content"
import { z } from "astro/zod"
import { pathToFileURL } from "node:url"

import { readSiteOptions } from "../../src/integration.ts"

// Les pages viennent du dépôt du client (HGDC_DOCS_DIR), pas de src/content/docs.
const { contentDir } = readSiteOptions()

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: pathToFileURL(`${contentDir}/`),
      pattern: ["**/[^_]*.{md,mdx}", "!**/node_modules/**", "!dist/**", "!.*/**", "!README.md", "!CHANGELOG.md"],
    }),
    // `sidebarTitle`, `icon` et `tag` (badge de la barre) : champs Mintlify, acceptés pour reprendre une doc existante.
    schema: docsSchema({
      extend: z.object({
        sidebarTitle: z.string().optional(),
        icon: z.string().optional(),
        tag: z.string().optional(),
      }),
    }),
  }),
}
