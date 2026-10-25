// WebMCP (https://webmachinelearning.github.io/webmcp/) : un site inscrit auprès du navigateur des outils qu'un
// agent appelle sans analyser le HTML. Ici, deux outils en lecture seule communs à la famille : ce qu'est le
// produit, et toute page du site en Markdown (jumeau `.md`, servi par `withMarkdown` ou `markdownRoutes`).
// Aucun outil n'écrit : une action se fait par l'interface ou par l'API, avec l'identité de la personne.
import { markdownTwin } from "./discovery.js"

export type WebMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: true }
  execute: (input: Record<string, unknown>) => Promise<unknown>
}

export type SiteToolsOptions = {
  /** Préfixe des noms d'outils, en minuscules : `portal` donne `portal_infos` et `portal_page`. */
  prefix: string
  /** Nom affiché du produit : « Portal ». */
  name: string
  /** Ce que renvoie `<prefix>_infos` : description, adresses utiles (llms.txt, auth.md, API, MCP). */
  info: Record<string, unknown>
  /** Base de chemin du site (`/mail`) ; vide à la racine. */
  base?: string
}

/** Chemin du jumeau Markdown d'une page du site, ou `null` pour un chemin qui sortirait du site. */
export function sitePagePath(path: unknown, base = ""): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) return null
  const scoped = base && !path.startsWith(`${base}/`) && path !== base ? `${base}${path}` : path
  return scoped.endsWith(".md") ? scoped : markdownTwin(scoped)
}

/** Outils du site, sans inscription : testables hors navigateur. */
export function siteTools(options: SiteToolsOptions, fetchPage: (path: string) => Promise<Response>): WebMcpTool[] {
  const empty = { type: "object", properties: {}, additionalProperties: false }
  return [
    {
      name: `${options.prefix}_infos`,
      title: `${options.name} : ce que fait le produit`,
      description: `Décrit ${options.name} et donne ses adresses utiles aux agents (résumé, accès, API).`,
      inputSchema: empty,
      annotations: { readOnlyHint: true },
      execute: async () => options.info,
    },
    {
      name: `${options.prefix}_page`,
      title: "Lire une page en Markdown",
      description: `Renvoie une page publique de ${options.name} en Markdown, par son chemin (\`/\`, \`/docs\`).`,
      inputSchema: {
        type: "object",
        properties: { chemin: { type: "string", description: "Chemin de la page, commençant par /" } },
        required: ["chemin"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const path = sitePagePath(input.chemin, options.base)
        if (!path) return { erreur: "Le chemin doit commencer par / et rester sur ce site." }
        const response = await fetchPage(path)
        if (!response.ok) return { erreur: `Page introuvable (${response.status}).`, chemin: input.chemin }
        return { chemin: input.chemin, markdown: await response.text() }
      },
    },
  ]
}

type ModelContext = { registerTool: (tool: WebMcpTool) => unknown }

/**
 * Inscrit les outils du site quand le navigateur prend WebMCP en charge (`document.modelContext`, ou
 * `navigator.modelContext` des premières implémentations). Sans prise en charge, ou hors navigateur, rien.
 * Un outil déjà inscrit (deuxième appel) est ignoré.
 */
export function registerSiteTools(options: SiteToolsOptions): void {
  if (typeof document === "undefined") return
  const context =
    (document as unknown as { modelContext?: ModelContext }).modelContext ??
    (navigator as unknown as { modelContext?: ModelContext }).modelContext
  if (!context || typeof context.registerTool !== "function") return
  const fetchPage = (path: string) => fetch(path, { headers: { Accept: "text/markdown" } })
  for (const tool of siteTools(options, fetchPage))
    Promise.resolve()
      .then(() => context.registerTool(tool))
      .catch(() => undefined)
}
