/**
 * Intégration d'une page de HGDC Status dans un site : le composant web `<hgdc-status>`
 * est servi par Status (`embed.js`) ; ce paquet le charge une seule fois et le type.
 */

/** Adresse du composant web, servi avec CORS ouvert et un cache court. */
export const STATUS_EMBED_URL = "https://status.hgdc.ch/embed.js"

/** `badge` : pastille et état global. `page` : composants, frise sur 90 jours, incidents. */
export type StatusView = "badge" | "page"
export type StatusTheme = "light" | "dark" | "auto"

/** Attributs de `<hgdc-status>`. */
export type StatusEmbedAttributes = {
  /** Adresse de la page de statut (`status.hgdc.ch/<page>`). */
  page: string
  view?: StatusView
  theme?: StatusTheme
  /** Où mène un clic sur le badge (par défaut, la page sur status.hgdc.ch). */
  href?: string
}

const loading = new Map<string, Promise<void>>()

/**
 * Charge le composant web une seule fois par document, même si plusieurs composants le
 * demandent. Sans `document` (rendu serveur), ne fait rien.
 */
export function loadStatusEmbed(src: string = STATUS_EMBED_URL): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve()
  const existing = loading.get(src)
  if (existing) return existing
  const done = new Promise<void>((resolve, reject) => {
    const already = document.querySelector<HTMLScriptElement>(`script[src="${CSS.escape(src)}"]`)
    if (already) return resolve()
    const script = document.createElement("script")
    script.type = "module"
    script.src = src
    script.addEventListener("load", () => resolve())
    script.addEventListener("error", () => {
      loading.delete(src)
      reject(new Error(`Composant de statut non chargé : ${src}`))
    })
    document.head.append(script)
  })
  loading.set(src, done)
  return done
}
