/**
 * Adresses d'un produit de la H Collection, déduites de son mot (ADR 0001 et 0005 de la famille) :
 * console sous `https://app.hgdc.ch/<mot>`, Convex sur `https://convex.<mot>.hgdc.ch` et
 * `https://actions.<mot>.hgdc.ch`. Écrites une fois ici, au lieu de variables posées sur Host et
 * Vercel puis recopiées dans chaque produit. Une surcharge reste possible : développement local
 * (Convex de dev, app à la racine), bacs à sable, Status et ses deux builds.
 *
 * Sans dépendance ni React : lisible par `vite.config.ts`, le serveur, le navigateur et Convex.
 */

/** Hôte commun des produits relayés par la passerelle. */
export const APP_ORIGIN = "https://app.hgdc.ch"

/**
 * Produits servis sous `https://app.hgdc.ch/<mot>` (consoles relayées par la passerelle, ADR 0005).
 * Account (fournisseur d'identité) et Portal (pas encore relayé) gardent leur hôte. Status : la
 * console seule, `status.hgdc.ch` garde les pages publiques et la console de secours. Vérifiée contre
 * le manifeste privé de la famille (`famille check`) : un produit relayé s'ajoute ici et là.
 */
export const APP_PRODUCTS = ["analytics", "mail", "host", "docs", "status", "iassistant", "portal"] as const

/** Vrai si le produit est servi sous `app.hgdc.ch`. */
export function isAppProduct(product: string): boolean {
  return (APP_PRODUCTS as ReadonlyArray<string>).includes(product.toLowerCase())
}

/**
 * Base de chemin normalisée : `""` (racine) ou `/segment`, sans barre finale. Même règle que
 * `normalizeBasePath` de `@hgdc/auth` : lève sur tout ce qui n'est pas un chemin de segments simples.
 */
export function normalizeProductBasePath(value: string | null | undefined): string {
  if (value === undefined || value === null || value === "" || value === "/") return ""
  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value
  const segments = trimmed.split("/")
  const valid =
    segments[0] === "" &&
    segments.length > 1 &&
    segments.slice(1).every((segment) => /^[A-Za-z0-9._~-]+$/.test(segment) && segment !== "." && segment !== "..")
  if (!valid) throw new Error(`@hgdc/ui/addresses : base invalide (${JSON.stringify(value)}), attendu « /produit ».`)
  return trimmed
}

/**
 * Base de chemin du build, pour `vite.config.ts` : `/<mot>` pour `vite build` d'un produit servi
 * sous app.hgdc.ch, la racine pour `vite dev` et Vitest (`command` = `serve`) et pour les autres
 * produits. `override` (la variable `HGDC_BASE_PATH`, si elle est posée) l'emporte : `/` force la
 * racine (build de `status.hgdc.ch`).
 */
export function productBasePath(
  product: string,
  options: { override?: string | undefined; command?: "build" | "serve" | undefined } = {},
): string {
  if (options.override !== undefined && options.override !== "") return normalizeProductBasePath(options.override)
  if (options.command === "serve" || !isAppProduct(product)) return ""
  return `/${product.toLowerCase()}`
}

/** Surcharges lues dans `import.meta.env` de Vite : absentes ou vides, la convention s'applique. */
export type AddressOverrides = {
  /** Base du build telle que Vite la pose (`/mail/`, `/` à la racine). */
  BASE_URL?: string | undefined
  /** Convex de développement (écrit par `convex dev` dans `.env.local`) ou d'un bac à sable. */
  VITE_CONVEX_URL?: string | undefined
  VITE_CONVEX_SITE_URL?: string | undefined
}

export type ProductAddresses = {
  /** Base de chemin : `/mail`, ou `""` à la racine. */
  basePath: string
  /** Origine publique de l'app : `https://app.hgdc.ch`, ou `https://<mot>.hgdc.ch` à la racine. */
  appOrigin: string
  /** Adresse publique de l'app, sans barre finale : `https://app.hgdc.ch/mail`. */
  appUrl: string
  /** Client Convex : `https://convex.<mot>.hgdc.ch`. */
  convexUrl: string
  /** Actions HTTP de Convex : `https://actions.<mot>.hgdc.ch`. */
  convexSiteUrl: string
  /** `withBase("/o/acme")` : `/mail/o/acme` sous la base, `/o/acme` à la racine. */
  withBase: (path: string) => string
}

const nonEmpty = (value: string | undefined): string | undefined => (value ? value : undefined)

/**
 * Adresses d'un produit, d'après son mot. Dans l'app : `productAddresses("mail", import.meta.env)`
 * (la base vient alors du build, `BASE_URL`, et un Convex de dev de `.env.local`). Sans `env` : la
 * production. Les adresses publiques sont des constantes, jamais tirées d'une requête (`Host`,
 * `x-forwarded-host` valent l'origine relayée).
 */
export function productAddresses(product: string, env: AddressOverrides = {}): ProductAddresses {
  const word = product.toLowerCase()
  if (!/^[a-z]+$/.test(word)) throw new Error(`@hgdc/ui/addresses : produit invalide « ${product} »`)
  const basePath = env.BASE_URL !== undefined ? normalizeProductBasePath(env.BASE_URL) : productBasePath(word)
  const appOrigin = basePath ? APP_ORIGIN : `https://${word}.hgdc.ch`
  return {
    basePath,
    appOrigin,
    appUrl: `${appOrigin}${basePath}`,
    convexUrl: nonEmpty(env.VITE_CONVEX_URL) ?? `https://convex.${word}.hgdc.ch`,
    convexSiteUrl: nonEmpty(env.VITE_CONVEX_SITE_URL) ?? `https://actions.${word}.hgdc.ch`,
    withBase: (path: string) => `${basePath}${path}`,
  }
}

// ── Deux vues d'un même build (ADR 0014 de la famille) ─────────────────────────────────

/**
 * Vue d'un produit : `app` sous `https://app.hgdc.ch/<mot>` (barre des produits), `seul` sur
 * `https://<mot>.hgdc.ch` (le produit seul). Même build : la passerelle ajoute la base sur
 * `<mot>.hgdc.ch`, toute adresse `/<mot>/…` y reste valide.
 */
export type ProductView = "app" | "seul"

/** Origine de la vue seule d'un produit : `https://mail.hgdc.ch`. */
export function soloOrigin(product: string): string {
  const word = product.toLowerCase()
  if (!/^[a-z]+$/.test(word)) throw new Error(`@hgdc/ui/addresses : produit invalide « ${product} »`)
  return `https://${word}.hgdc.ch`
}

/** Origine publique d'une vue : une constante, jamais tirée de la requête. */
export function viewOrigin(product: string, view: ProductView): string {
  return view === "seul" ? soloOrigin(product) : APP_ORIGIN
}

/**
 * Vue d'après le nom de la page (`location.hostname`) : `seul` sur `<mot>.hgdc.ch` d'un produit servi
 * sous `app.hgdc.ch`, `app` sinon (Account n'a qu'une vue).
 */
export function viewFromHostname(product: string, hostname: string): ProductView {
  if (!isAppProduct(product)) return "app"
  return `https://${hostname.toLowerCase()}` === soloOrigin(product) ? "seul" : "app"
}

/**
 * Origines publiques des consoles, pour une liste fermée (CORS d'Account) : `app.hgdc.ch` et la vue
 * seule de chaque produit servi sous `app.hgdc.ch`.
 */
export const CONSOLE_ORIGINS: ReadonlyArray<string> = [APP_ORIGIN, ...APP_PRODUCTS.map(soloOrigin)]

/**
 * Adresse affichée en vue seule : la base retirée (`/mail/o/acme` devient `/o/acme`). À donner au
 * routeur dans le navigateur, sur `<mot>.hgdc.ch` seulement :
 * `createBrowserHistory({ createHref: (href) => soloHref(basePath, href) })`. Le serveur reçoit
 * toujours la base (la passerelle l'ajoute) ; un chemin qui la garde reste valide.
 */
export function soloHref(basePath: string, href: string): string {
  const base = normalizeProductBasePath(basePath)
  if (!base || !href.startsWith(base)) return href
  const rest = href.slice(base.length)
  if (rest === "") return "/"
  if (rest.startsWith("?") || rest.startsWith("#")) return `/${rest}`
  // `/mailbox` n'est pas sous `/mail` ; `//x` resterait une adresse externe.
  if (!rest.startsWith("/") || rest.startsWith("//") || rest.includes("\\")) return href
  return rest
}
