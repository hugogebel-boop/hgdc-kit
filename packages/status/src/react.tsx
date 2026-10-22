import { createElement, useEffect, type ReactElement } from "react"

import { loadStatusEmbed, STATUS_EMBED_URL, type StatusEmbedAttributes } from "./index.ts"

export type HgdcStatusProps = StatusEmbedAttributes & {
  className?: string
  /** Adresse du composant web, pour un essai local. */
  src?: string
  /** Affiché tant que le composant n'est pas chargé, et si le script est bloqué. */
  children?: React.ReactNode
}

/**
 * Page de statut HGDC dans une app React : rend `<hgdc-status>` et charge son script.
 *   <HgdcStatus page="agence" view="badge" />
 * La CSP du site doit autoriser https://status.hgdc.ch dans `script-src` et `connect-src`.
 */
export function HgdcStatus({
  page,
  view = "page",
  theme,
  href,
  className,
  src = STATUS_EMBED_URL,
  children,
}: HgdcStatusProps): ReactElement {
  useEffect(() => {
    // Un script bloqué (CSP, réseau) laisse simplement le contenu de repli.
    loadStatusEmbed(src).catch(() => {})
  }, [src])
  return createElement(
    "hgdc-status",
    { page, view, ...(theme ? { theme } : {}), ...(href ? { href } : {}), class: className },
    children,
  )
}
