import { defineRouteMiddleware, type StarlightRouteData } from "@astrojs/starlight/route-data"
import data from "virtual:hgdc-docs/config"

type Entry = StarlightRouteData["sidebar"][number]
type Link = Extract<Entry, { type: "link" }>

const containsCurrent = (entry: Entry): boolean =>
  entry.type === "link" ? entry.isCurrent : entry.entries.some(containsCurrent)

const links = (entries: Array<Entry>): Array<Link> =>
  entries.flatMap((entry) => (entry.type === "link" ? [entry] : links(entry.entries)))

/**
 * Plusieurs versions ou onglets : la sidebar de Starlight en contient une entrée par
 * couple (version, onglet). On ne garde que celle de la page affichée, et la pagination
 * précédent / suivant reste dans cette section.
 */
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute
  const sections = data.tree.versions.flatMap((version) => version.tabs)
  if (sections.length > 1) {
    const index = Math.max(route.sidebar.findIndex(containsCurrent), 0)
    const section = route.sidebar[index]
    if (section?.type === "group") route.sidebar = section.entries
    context.locals.hgdcSection = index
  }
  const all = links(route.sidebar)
  const current = all.findIndex((link) => link.isCurrent)
  if (current !== -1 && route.pagination) {
    route.pagination.prev = all[current - 1]
    route.pagination.next = all[current + 1]
  }
})
