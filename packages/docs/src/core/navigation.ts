import { slugifySegment, type DocsConfig, type NavGroupInput } from "./config.ts"

/**
 * Navigation normalisée : toujours versions → onglets → éléments, quelle que soit la forme
 * écrite dans `docs.json` (pages seules, groupes, onglets ou versions, comme Mintlify).
 */
export type NavItem =
  | { type: "page"; page: string }
  | { type: "group"; label: string; expanded: boolean; items: Array<NavItem> }

export type NavTab = { id: string; label: string | null; items: Array<NavItem> }
export type NavVersion = { id: string | null; label: string | null; isDefault: boolean; tabs: Array<NavTab> }
export type NavTree = { versions: Array<NavVersion> }

type Container = { groups?: Array<NavGroupInput>; pages?: Array<string | NavGroupInput> }

function items(container: Container): Array<NavItem> {
  if (container.groups) return container.groups.map(group)
  return (container.pages ?? []).map(entry)
}

function entry(value: string | NavGroupInput): NavItem {
  return typeof value === "string" ? { type: "page", page: value } : group(value)
}

function group(value: NavGroupInput): NavItem {
  return { type: "group", label: value.group, expanded: value.expanded ?? true, items: value.pages.map(entry) }
}

function tabs(container: Container & { tabs?: Array<Container & { tab: string }> }): Array<NavTab> {
  if (container.tabs)
    return container.tabs.map((tab) => ({ id: slugifySegment(tab.tab), label: tab.tab, items: items(tab) }))
  return [{ id: "main", label: null, items: items(container) }]
}

export function normalizeNavigation(config: DocsConfig): NavTree {
  const nav = config.navigation
  if (nav.versions) {
    const hasDefault = nav.versions.some((v) => v.default)
    return {
      versions: nav.versions.map((version, index) => ({
        id: slugifySegment(version.version),
        label: version.version,
        isDefault: version.default ?? (!hasDefault && index === 0),
        tabs: tabs(version),
      })),
    }
  }
  return { versions: [{ id: null, label: null, isDefault: true, tabs: tabs(nav) }] }
}

export function pagesOf(list: Array<NavItem>): Array<string> {
  return list.flatMap((item) => (item.type === "page" ? [item.page] : pagesOf(item.items)))
}

export function allPages(tree: NavTree): Array<string> {
  return tree.versions.flatMap((version) => version.tabs.flatMap((tab) => pagesOf(tab.items)))
}

export type PageLocation = { version: NavVersion; tab: NavTab }

/** Version et onglet qui contiennent une page ; la première occurrence l'emporte. */
export function locatePage(tree: NavTree, page: string): PageLocation | null {
  for (const version of tree.versions)
    for (const tab of version.tabs) if (pagesOf(tab.items).includes(page)) return { version, tab }
  return null
}

export function defaultVersion(tree: NavTree): NavVersion {
  return tree.versions.find((v) => v.isDefault) ?? tree.versions[0]!
}

/** Page « index » à la racine du site, « guides/index » sur `/guides/`. */
export function pageToSlug(page: string): string {
  const lower = page.toLowerCase()
  if (lower === "index") return ""
  return lower.endsWith("/index") ? lower.slice(0, -"/index".length) : lower
}

export function pageToPath(page: string): string {
  const slug = pageToSlug(page)
  return slug ? `/${slug}/` : "/"
}

/** Sous-chemin du site tel que docs.json le déclare, ou `""` pour un site à la racine. */
export function siteBase(config: Pick<DocsConfig, "base">): string {
  return config.base ? config.base.replace(/\/+$/, "") : ""
}

/**
 * Chemin public d'un chemin du site : `/guides/publier/` → `/docs/guides/publier/` sous
 * `base: "/docs"`. Un chemin qui porte déjà le sous-chemin, ou qui n'est pas absolu
 * (`#ancre`, `https://…`, `//hôte`), reste tel quel.
 */
export function withBase(base: string, path: string): string {
  if (!base || !path.startsWith("/") || path.startsWith("//")) return path
  if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}#`) || path.startsWith(`${base}?`))
    return path
  return `${base}${path}`
}

/** Chemin du site sans son sous-chemin : `/docs/guides/` → `/guides/`, `/docs/` → `/`. */
export function withoutBase(base: string, pathname: string): string {
  if (!base) return pathname
  if (pathname === base) return "/"
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname
}

/** Pages citées dans la navigation mais absentes du dossier : erreur de build lisible. */
export function missingPages(tree: NavTree, existing: ReadonlySet<string>): Array<string> {
  return [...new Set(allPages(tree))].filter((page) => !existing.has(pageToSlug(page)))
}
