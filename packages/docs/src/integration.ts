import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { unified } from "@astrojs/markdown-remark"
import starlight from "@astrojs/starlight"
import type { AstroIntegration, AstroUserConfig } from "astro"
import type { Plugin } from "vite"

import { remarkAutoImport } from "./build/auto-import.ts"
import { mintlifyCodeMeta } from "./build/code-meta.ts"
import { remarkBaseLinks } from "./build/base-links.ts"
import { rehypeDocsContent } from "./build/content.ts"
import { isPublishedAsset, publicFiles } from "./build/public-files.ts"
import { writeMachineReadable } from "./build/outputs.ts"
import { parseDocsConfig, socialNetwork, withHostProject, type DocsConfig } from "./core/config.ts"
import {
  missingPages,
  normalizeNavigation,
  pageToSlug,
  siteBase,
  type NavItem,
  type NavTree,
} from "./core/navigation.ts"
import { needsRestart } from "./preview/live.ts"

/** Où lire la doc du client et où écrire le site : posé par la CLI `hgdc-docs`. */
export type SiteOptions = {
  contentDir: string
  outDir: string
  /** Adresse publique du site, pour les liens absolus de `llms.txt` et le sitemap. */
  site: string | null
  /** API de l'assistant (console HGDC Docs). */
  apiEndpoint: string
  /** Projet de la console annoncé par HGDC Host (`HGDC_DOCS_PROJECT`), si docs.json n'en a pas. */
  project: string | null
  /**
   * Aperçu de la console (ADR 0011) : rendu à la demande par `astro dev`, marqué « Aperçu,
   * non publié », piloté par la console (thème, page) depuis `parentOrigin` seulement.
   */
  preview: PreviewOptions | null
  /**
   * Dossier de travail d'Astro (`.astro/`, magasin du contenu) : le modèle du paquet par
   * défaut ; un dossier par session d'aperçu, pour qu'aucune doc ne voie celui d'une autre.
   */
  root: string | null
  /**
   * Fichiers de travail du build (`public` recopié, cache, témoin de redémarrage) :
   * `<doc>/.hgdc-docs` par défaut. Dans l'aperçu, hors du dossier de la doc, que le serveur
   * Astro ne peut pas modifier (`HGDC_DOCS_WORK`, ADR 0011).
   */
  workDir: string
}

export type PreviewOptions = {
  /** Origine de la console qui encadre l'aperçu (`https://docs.hgdc.ch`). */
  parentOrigin: string
  /** Port public du WebSocket de rechargement, derrière la passerelle (443 en production). */
  hmrPort: number | null
}

export const DEFAULT_API = "https://docs.hgdc.ch"
const FONT_PACKAGES = ["@fontsource-variable/inter", "@fontsource-variable/geist"]
const packageDir = (name: string) => dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)))
const here = dirname(fileURLToPath(import.meta.url))
const file = (path: string) => resolve(here, path)

export function readSiteOptions(env: NodeJS.ProcessEnv = process.env): SiteOptions {
  const contentDir = resolve(env.HGDC_DOCS_DIR ?? process.cwd())
  const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null
  return {
    contentDir,
    outDir: resolve(env.HGDC_DOCS_OUT ?? join(contentDir, "dist")),
    site: siteOrigin(env.HGDC_DOCS_SITE ?? vercelUrl),
    apiEndpoint: env.HGDC_DOCS_API ?? DEFAULT_API,
    project: env.HGDC_DOCS_PROJECT ?? null,
    preview: previewOptions(env),
    root: env.HGDC_DOCS_ROOT ? resolve(env.HGDC_DOCS_ROOT) : null,
    workDir: env.HGDC_DOCS_WORK ? resolve(env.HGDC_DOCS_WORK) : join(contentDir, ".hgdc-docs"),
  }
}

function previewOptions(env: NodeJS.ProcessEnv): PreviewOptions | null {
  const parent = env.HGDC_DOCS_PREVIEW_PARENT
  if (!parent) return null
  const port = Number(env.HGDC_DOCS_PREVIEW_HMR_PORT)
  return {
    parentOrigin: new URL(parent).origin,
    hmrPort: Number.isInteger(port) && port > 0 && port < 65_536 ? port : null,
  }
}

/**
 * Origine du site seulement : le sous-chemin vient de `base` dans docs.json, pas de
 * l'adresse (`https://app.ch/docs` et `https://app.ch` donnent le même site).
 */
function siteOrigin(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    throw new DocsConfigError(
      `HGDC_DOCS_SITE : adresse invalide (${value.slice(0, 100)}). Exemple : https://docs.exemple.ch`,
    )
  }
}

export class DocsConfigError extends Error {}

export function loadDocsConfig(contentDir: string, hostProject: string | null = null): DocsConfig {
  const path = join(contentDir, "docs.json")
  if (!existsSync(path)) throw new DocsConfigError(`Aucun docs.json dans ${contentDir}. Crée-le à la racine de la doc.`)
  const parsed = parseDocsConfig(readFileSync(path, "utf8"))
  const result = parsed.ok ? withHostProject(parsed.config, hostProject ?? undefined) : parsed
  if (!result.ok) throw new DocsConfigError(`docs.json invalide :\n- ${result.errors.join("\n- ")}`)
  return result.config
}

/** Ce que les composants du modèle lisent par `virtual:hgdc-docs/config`. */
export type VirtualConfig = {
  config: DocsConfig
  tree: NavTree
  apiEndpoint: string
  site: string | null
  /** Sous-chemin du site (`/docs`), `""` à la racine. */
  base: string
}

const IGNORED_DIRS = new Set(["node_modules", "dist", ".hgdc-docs", ".git", ".github", ".vercel"])

function collectPublic(contentDir: string, workDir: string, declared: ReadonlyArray<string>): string {
  const target = join(workDir, "public")
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const file of publicFiles(contentDir, declared)) cpSync(file.from, join(target, file.to))
  return target
}

/** Ce que le frontmatter d'une page change dans la barre : `sidebarTitle` et `tag` (champs Mintlify). */
type PageMeta = { label: string | null; tag: string | null }

/** Pages du dépôt (`guides/publier`) et leurs réglages de barre latérale. */
function scanPages(contentDir: string): Map<string, PageMeta> {
  const pages = new Map<string, PageMeta>()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || IGNORED_DIRS.has(name)) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.mdx?$/.test(name) && !name.startsWith("_")) {
        const page = relative(contentDir, path)
          .replaceAll("\\", "/")
          .replace(/\.mdx?$/, "")
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, "utf8"))?.[1] ?? ""
        const field = (name: string) =>
          new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, "m").exec(frontmatter)?.[1] ?? null
        pages.set(pageToSlug(page), { label: field("sidebarTitle"), tag: field("tag") })
      }
    }
  }
  walk(contentDir)
  return pages
}

type SidebarItem =
  | { slug: string; label?: string; badge?: { text: string; variant: "note" } }
  | { label: string; collapsed: boolean; items: Array<SidebarItem> }

function sidebarItems(items: Array<NavItem>, labels: ReadonlyMap<string, PageMeta>): Array<SidebarItem> {
  return items.map((item) => {
    if (item.type === "group")
      return { label: item.label, collapsed: !item.expanded, items: sidebarItems(item.items, labels) }
    const slug = pageToSlug(item.page)
    const meta = labels.get(slug)
    return {
      slug,
      ...(meta?.label ? { label: meta.label } : {}),
      ...(meta?.tag ? { badge: { text: meta.tag.slice(0, 16), variant: "note" as const } } : {}),
    }
  })
}

/**
 * Une entrée de premier niveau par couple (version, onglet), dans l'ordre de l'arbre ;
 * `route-data.ts` ne garde ensuite que celle de la page affichée.
 */
export function starlightSidebar(tree: NavTree, labels: ReadonlyMap<string, PageMeta> = new Map()): Array<SidebarItem> {
  const sections = tree.versions.flatMap((version) => version.tabs)
  if (sections.length === 1) return sidebarItems(sections[0]!.items, labels)
  return tree.versions.flatMap((version) =>
    version.tabs.map((tab) => ({
      label: [version.label, tab.label].filter(Boolean).join(" · ") || "Documentation",
      collapsed: false,
      items: sidebarItems(tab.items, labels),
    })),
  )
}

/**
 * `redirects` de docs.json en redirections d'Astro : une page qui renvoie à la nouvelle
 * adresse (le site est statique). Chemins écrits comme les liens de la doc, `base` ajouté.
 */
export function astroRedirects(
  redirects: ReadonlyArray<{ source: string; destination: string; permanent?: boolean | undefined }>,
  base: string,
): Record<string, { status: 301 | 302; destination: string }> {
  const slash = (path: string) => (path.endsWith("/") ? path : `${path}/`)
  return Object.fromEntries(
    redirects.map((item) => [
      slash(item.source),
      {
        status: item.permanent === false ? 302 : 301,
        destination: item.destination.startsWith("/")
          ? `${base}${slash(item.destination.split("#")[0]!)}${item.destination.includes("#") ? `#${item.destination.split("#")[1]}` : ""}`
          : item.destination,
      },
    ]),
  )
}

function virtualConfigPlugin(initial: VirtualConfig, options: SiteOptions): Plugin {
  const id = "virtual:hgdc-docs/config"
  let data = initial
  return {
    name: "hgdc-docs-config",
    resolveId: (source: string) => (source === id ? `\0${id}` : undefined),
    load: (source: string) => (source === `\0${id}` ? `export default ${JSON.stringify(data)}` : undefined),
    /**
     * `hgdc-docs dev` et l'aperçu (ADR 0011). Un réglage d'apparence de docs.json (couleurs,
     * logo, en-tête, pied) se relit sans redémarrer : le module de configuration est
     * invalidé et la page se recharge, rendue par les mêmes composants. Un changement de
     * structure (navigation, redirections, sous-chemin…) redémarre Astro. Une image ajoutée
     * dans un dossier d'images est servie tout de suite.
     */
    configureServer(server) {
      const docsJson = resolve(options.contentDir, "docs.json")
      const publicDir = join(options.workDir, "public")
      server.watcher.add(docsJson)
      const reload = () => {
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(`\0${id}`)
          if (module) environment.moduleGraph.invalidateModule(module, new Set(), Date.now(), true)
          environment.hot.send({ type: "full-reload" })
        }
      }
      const onFile = (changed: string) => {
        const path = resolve(changed)
        if (path === docsJson) {
          let config: DocsConfig
          try {
            config = loadDocsConfig(options.contentDir, options.project)
          } catch (error) {
            // docs.json à moitié écrit ou invalide : la page garde le dernier état valable.
            server.config.logger.error(error instanceof Error ? error.message : String(error))
            return
          }
          // Astro relit sa configuration quand ce témoin change (`addWatchFile`, `devServer`).
          if (needsRestart(data.config, config)) return writeFileSync(restartMarker(options), String(Date.now()))
          data = { ...data, config }
          return reload()
        }
        const published = relative(options.contentDir, path).replaceAll("\\", "/")
        if (!isPublishedAsset(published)) return
        const target = join(publicDir, published.startsWith("public/") ? published.slice("public/".length) : published)
        mkdirSync(dirname(target), { recursive: true })
        cpSync(path, target)
        reload()
      }
      server.watcher.on("change", onFile)
      server.watcher.on("add", onFile)
    },
  }
}

/** Site sous un sous-chemin : la racine renvoie vers la doc, pour une visite directe de l'hôte. */
const rootRedirect = (base: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${base}/"><link rel="canonical" href="${base}/"><a href="${base}/">Documentation</a>\n`

const restartMarker = (options: SiteOptions) => join(options.workDir, "restart")

/**
 * `hgdc-docs dev` : le témoin de redémarrage écrit par `virtualConfigPlugin`. Aperçu de la
 * console seulement : le pont avec la console et la mention « Aperçu, non publié »,
 * posée par-dessus la page sans rien changer à sa mise en page.
 */
function devServer(options: SiteOptions): AstroIntegration {
  return {
    name: "hgdc-docs-dev",
    hooks: {
      "astro:config:setup": ({ command, addWatchFile, injectScript }) => {
        if (command !== "dev") return
        const marker = restartMarker(options)
        if (!existsSync(marker)) writeFileSync(marker, "")
        addWatchFile(marker)
        if (!options.preview) return
        injectScript("head-inline", `window.__HGDC_PREVIEW_PARENT__=${JSON.stringify(options.preview.parentOrigin)}`)
        injectScript("page", `import ${JSON.stringify(file("./preview/bridge.ts").replaceAll("\\", "/"))}`)
      },
    },
  }
}

function machineReadableOutputs(data: VirtualConfig, options: SiteOptions): AstroIntegration {
  return {
    name: "hgdc-docs-outputs",
    hooks: {
      "astro:build:done": async ({ dir, pages, logger }) => {
        const written = await writeMachineReadable({
          outDir: fileURLToPath(dir),
          pathnames: pages.map((page) => page.pathname),
          config: data.config,
          tree: data.tree,
          site: options.site,
          base: data.base,
        })
        logger.info(`llms.txt, llms-full.txt, ${written.pages} pages Markdown et le corpus de l'assistant écrits.`)
        // Le build tourne dans le paquet, où ses dépendances se résolvent quel que soit le
        // gestionnaire du client (npm, pnpm, bun isolé), puis le site seul est copié chez lui.
        // Sous un sous-chemin, le site va dans `dist/<base>/` : servi tel quel par Host, il
        // répond aux mêmes adresses que derrière le proxy du produit (`/docs/_astro/…`).
        rmSync(options.outDir, { recursive: true, force: true })
        const target = join(options.outDir, ...data.base.split("/").filter(Boolean))
        cpSync(fileURLToPath(dir), target, { recursive: true, filter: (path) => !path.includes(".prerender") })
        if (data.base) writeFileSync(join(options.outDir, "index.html"), rootRedirect(data.base))
        logger.info(`Site écrit dans ${options.outDir}`)
      },
    },
  }
}

export function createAstroConfig(options: SiteOptions = readSiteOptions()): AstroUserConfig {
  const config = loadDocsConfig(options.contentDir, options.project)
  const tree = normalizeNavigation(config)
  const pages = scanPages(options.contentDir)
  const missing = missingPages(tree, new Set(pages.keys()))
  if (missing.length)
    throw new DocsConfigError(
      `docs.json cite des pages absentes du dossier :\n- ${missing.map((page) => `${page}.mdx`).join("\n- ")}`,
    )
  const base = siteBase(config)
  const data: VirtualConfig = { config, tree, apiEndpoint: options.apiEndpoint, site: options.site, base }
  const logo = typeof config.logo === "string" ? { light: config.logo } : config.logo
  const asset = (path: string) => join(options.contentDir, path.replace(/^\//, ""))
  const social = Object.entries(config.footer?.socials ?? {}).flatMap(([key, href]) => {
    const network = socialNetwork(key)
    return network ? [{ icon: network.icon as "github", label: network.label, href }] : []
  })

  return {
    root: options.root ?? file("../template"),
    srcDir: file("../template/src"),
    publicDir: collectPublic(
      options.contentDir,
      options.workDir,
      [logo?.light, logo?.dark, config.favicon].filter((p): p is string => Boolean(p)),
    ),
    outDir: options.root ? join(options.root, ".build") : file("../template/.build"),
    cacheDir: join(options.workDir, "cache"),
    site: options.site ?? undefined,
    ...(base ? { base } : {}),
    trailingSlash: "always",
    devToolbar: { enabled: false },
    redirects: astroRedirects(config.redirects ?? [], base),
    markdown: {
      processor: unified({
        remarkPlugins: [remarkAutoImport, [remarkBaseLinks, { base }]],
        rehypePlugins: [rehypeDocsContent],
      }),
    },
    vite: {
      plugins: [virtualConfigPlugin(data, options)],
      // Les composants importés d'office (`build/auto-import.ts`) se résolvent dans ce paquet,
      // même quand la doc vit hors de son `node_modules` (dossier d'aperçu, ADR 0011).
      resolve: {
        alias: [{ find: /^@hgdc\/docs\/components\//, replacement: `${file("./components").replaceAll("\\", "/")}/` }],
      },
      server: {
        // Les polices de theme.css vivent dans le `node_modules` où le paquet est installé
        // (remonté par npm ou bun) : sans elles, `hgdc-docs dev` et l'aperçu tombent sur la
        // police de secours, et l'aperçu ne ressemble plus au site publié.
        // Aperçu : la doc de l'emplacement, le modèle et les polices, rien d'autre.
        fs: {
          allow: options.preview
            ? [options.contentDir, options.workDir, file("."), file("../template"), ...FONT_PACKAGES.map(packageDir)]
            : [options.contentDir, file(".."), ...FONT_PACKAGES.map(packageDir)],
        },
        // Derrière la passerelle d'aperçu : elle seule vérifie l'hôte et l'accès.
        ...(options.preview
          ? {
              allowedHosts: true,
              // Le port est celui de l'emplacement : occupé, Astro s'arrête plutôt que d'en prendre un autre.
              strictPort: true,
              hmr: options.preview.hmrPort ? { clientPort: options.preview.hmrPort } : {},
            }
          : {}),
      },
    },
    integrations: [
      starlight({
        title: config.name,
        description: config.description,
        locales: { root: { label: "Français", lang: config.language === "fr" ? "fr-CH" : config.language } },
        logo: logo
          ? { light: asset(logo.light), dark: asset(logo.dark ?? logo.light), replacesTitle: false }
          : undefined,
        favicon: config.favicon ?? "/favicon.svg",
        social,
        sidebar: starlightSidebar(tree, pages),
        // Dans cet ordre : la cascade d'avant le découpage (content.css est partagé avec l'éditeur).
        customCss: [
          file("./styles/tokens.css"),
          file("./styles/theme.css"),
          file("./styles/content.css"),
          file("./styles/chrome.css"),
        ],
        head: [
          // Remplace le viewport de Starlight : `cover` rend les safe-area utilisables (barre de question sticky).
          {
            tag: "meta",
            attrs: { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
          },
        ],
        routeMiddleware: file("./overrides/route-data.ts"),
        components: {
          Head: file("./overrides/Head.astro"),
          Header: file("./overrides/Header.astro"),
          ThemeProvider: file("./overrides/ThemeProvider.astro"),
          Search: file("./overrides/Search.astro"),
          Sidebar: file("./overrides/Sidebar.astro"),
          PageTitle: file("./overrides/PageTitle.astro"),
          PageFrame: file("./overrides/PageFrame.astro"),
          PageSidebar: file("./overrides/PageSidebar.astro"),
          TwoColumnContent: file("./overrides/TwoColumnContent.astro"),
          Footer: file("./overrides/Footer.astro"),
        },
        expressiveCode: {
          // Clair d'abord (thème par défaut du site) ; le sombre suit `data-hd-theme` (ThemeProvider).
          themes: ["github-light-default", "github-dark-default"],
          useDarkModeMediaQuery: false,
          themeCssSelector: (theme) => (theme.type === "dark" ? '[data-hd-theme="dark"]' : false),
          // Blocs dessinés par theme.css (filet, en-tête, actions) : un cadre unique pour le
          // shell comme pour le reste. Le bouton Copier d'Expressive Code reste dans le HTML,
          // caché : son `data-code` porte le texte exact (build/markdown.ts, widget/code.ts).
          defaultProps: { frame: "code" },
          plugins: [mintlifyCodeMeta()],
          styleOverrides: {
            borderRadius: "1rem",
            borderColor: "var(--hd-border)",
            borderWidth: "1px",
            codeBackground: "var(--hd-code-bg)",
            codeFontFamily: "var(--hd-font-mono)",
            codeFontSize: "0.8125rem",
            codeLineHeight: "1.7",
            codePaddingBlock: "0.875rem",
            codePaddingInline: "1rem",
            uiFontFamily: "var(--hd-font-sans)",
            uiFontSize: "0.8125rem",
            frames: {
              frameBoxShadowCssValue: "none",
              editorTabBarBackground: "var(--hd-code-header)",
              editorTabBarBorderBottomColor: "var(--hd-border)",
              editorActiveTabBackground: "transparent",
              editorActiveTabForeground: "var(--hd-fg)",
              editorActiveTabBorderColor: "transparent",
              editorActiveTabIndicatorTopColor: "transparent",
              editorActiveTabIndicatorBottomColor: "var(--hd-accent)",
              editorActiveTabIndicatorHeight: "2px",
              editorTabBorderRadius: "0",
              editorBackground: "var(--hd-code-bg)",
              terminalBackground: "var(--hd-code-bg)",
              terminalTitlebarBackground: "var(--hd-code-header)",
              terminalTitlebarBorderBottomColor: "var(--hd-border)",
              terminalTitlebarForeground: "var(--hd-muted-fg)",
              terminalTitlebarDotsOpacity: "0",
            },
          },
        },
        pagination: true,
      }),
      devServer(options),
      machineReadableOutputs(data, options),
    ],
  }
}
