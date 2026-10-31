import { z } from "zod"

/**
 * Corpus publié avec chaque build, à `/_hgdc/corpus.json` : le contenu exact du site en
 * Markdown, page par page. La console le lit après une publication pour indexer
 * l'assistant ; rien d'autre que ce qui est public n'entre dans l'index.
 */
export const CORPUS_PATH = "/_hgdc/corpus.json"
export const CORPUS_FORMAT = 1
export const MAX_PAGES = 2000
export const MAX_PAGE_CHARS = 200_000

/**
 * Chemin d'une page du site : commence par un seul « / », sans « // », sans « \ » ni
 * caractère de contrôle. Sinon `new URL(chemin, site)` sortirait du site (« //evil.example »).
 */
export function isSitePath(path: string): boolean {
  // oxlint-disable-next-line no-control-regex -- on refuse justement ces caractères
  return path.startsWith("/") && !path.includes("//") && !/[\\\u0000-\u001f]/.test(path)
}

export const corpusPageSchema = z.object({
  path: z.string().max(512).refine(isSitePath, "chemin du site attendu (/guides/publier/)"),
  title: z.string().max(300),
  description: z.string().max(1000).nullable(),
  version: z.string().max(32).nullable(),
  markdown: z.string().max(MAX_PAGE_CHARS),
})

export const corpusSchema = z.object({
  format: z.literal(CORPUS_FORMAT),
  project: z.string().nullable(),
  name: z.string().max(80),
  language: z.string().max(8),
  builtAt: z.iso.datetime(),
  theme: z.object({ primary: z.string().nullable(), logo: z.string().nullable() }),
  versions: z.array(z.object({ id: z.string().nullable(), label: z.string().nullable(), isDefault: z.boolean() })),
  pages: z.array(corpusPageSchema).max(MAX_PAGES),
})

export type CorpusPage = z.infer<typeof corpusPageSchema>
export type Corpus = z.infer<typeof corpusSchema>
