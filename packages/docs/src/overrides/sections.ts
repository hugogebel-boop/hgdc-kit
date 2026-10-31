import type { DocsConfig } from "../core/config.ts"
import {
  pagesOf,
  pageToPath,
  withBase,
  type NavItem,
  type NavTab,
  type NavTree,
  type NavVersion,
} from "../core/navigation.ts"

/** Section affichée (version, onglet) et onglets de sa version, pour l'en-tête et le menu. */
export function docsSections(tree: NavTree, index: number) {
  const sections = tree.versions.flatMap((version) => version.tabs.map((tab) => ({ version, tab })))
  const current = sections[index] ?? sections[0]!
  const tabs: Array<NavTab> = current.version.tabs.filter((tab) => tab.label)
  const versions: Array<NavVersion> = tree.versions.filter((version) => version.label)
  return { current, tabs, versions }
}

/** Première page d'une liste : la cible d'un onglet ou d'une version. */
export function sectionHref(base: string, items: Array<NavItem>): string {
  const first = pagesOf(items)[0]
  return withBase(base, first ? pageToPath(first) : "/")
}

export function assistantEnabled(config: DocsConfig): boolean {
  return Boolean(config.project) && config.assistant?.enabled !== false
}

/** Bouton vers l'application (`app`) : « Ouvrir <name> » sauf libellé donné. */
export function appLink(config: DocsConfig): { href: string; label: string } | null {
  return config.app ? { href: config.app.href, label: config.app.label ?? `Ouvrir ${config.name}` } : null
}
