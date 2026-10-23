import { initials } from "./initials.ts"
import { FAMILY_PRODUCTS } from "./family-svg.ts"
import { PRODUCT_ORIGINS } from "./products.ts"

/*
 * Mémoire de la coque, partagée par les produits servis sous la même origine (`app.hgdc.ch/<produit>`,
 * ADR 0020) : ce qu'il faut pour que la première image d'un produit ait déjà la barre des produits
 * complète et la barre latérale à sa taille, avant que ses données n'arrivent.
 *
 * - l'organisation affichée en dernier : ses initiales et son logo (rien d'autre, pas le nom) ;
 * - la hauteur de la navigation de chaque produit, pour un squelette à la bonne taille ;
 * - le passage en cours d'un produit à l'autre (session de l'onglet), pour que la barre d'arrivée
 *   ne s'élargisse pas sous une souris restée immobile.
 *
 * `shellBoot` applique la mémoire sur `<html>` avant la première peinture : il tourne en ligne
 * dans le `<head>` (`sidebarInitScript`), donc il ne dépend de rien d'autre que de ses arguments.
 */

/** Organisation affichée en dernier : `{ initials, logo? }`, en `localStorage`. */
export const SHELL_ORG_KEY = "hgdc-shell:org"
/** Hauteur en pixels de la navigation d'un produit : `hgdc-shell:nav:<produit>`. */
export const SHELL_NAV_KEY_PREFIX = "hgdc-shell:nav:"
/** Passage d'un produit à l'autre (horodatage), en `sessionStorage`. */
export const SHELL_SWITCH_KEY = "hgdc-shell:switch"
/** Au-delà, un passage noté n'est plus celui qu'on vit (onglet laissé, retour bien plus tard). */
export const SHELL_SWITCH_MAX_AGE_MS = 10_000

export type ShellOrganization = { initials: string; logo?: string }

export type ShellBootConfig = {
  /** Clé du rail de la barre latérale (`sidebar`), valeur `rail`. */
  railKey: string
  orgKey: string
  navKeyPrefix: string
  /** Les produits de la famille, par mot en minuscules. */
  products: ReadonlyArray<string>
  /** `[produit, origine, base]` des produits servis sous une base de chemin (`PRODUCT_ORIGINS`). */
  origins: ReadonlyArray<readonly [string, string, string]>
  /** Domaine des produits sur leur sous-domaine (`hgdc.ch` : `mail.hgdc.ch` est Mail). */
  domain: string
}

type BootWindow = {
  document: { documentElement: HTMLElement }
  location: { origin: string; hostname: string; pathname: string }
  localStorage: Pick<Storage, "getItem">
}

/**
 * Applique la mémoire de la coque sur `<html>` : `data-sidebar="rail"`, `data-hgdc-product`
 * (le produit de l'adresse), `data-hgdc-org` et les variables `--hgdc-org-initials`,
 * `--hgdc-org-logo`, `--hgdc-nav-height` que lit `styles.css`. Autonome : sa source est recopiée
 * telle quelle dans le script en ligne du `<head>`.
 */
export function shellBoot(config: ShellBootConfig, win: BootWindow): void {
  // Ni fonction imbriquée ni import : un outil de construction n'a rien à y injecter.
  const root = win.document.documentElement
  let rail: string | null = null
  let rawOrg: string | null = null
  try {
    rail = win.localStorage.getItem(config.railKey)
    rawOrg = win.localStorage.getItem(config.orgKey)
  } catch {
    // Stockage bloqué : rien à reprendre.
  }
  if (rail === "rail") root.dataset.sidebar = "rail"

  let product = ""
  for (const [word, origin, base] of config.origins) {
    const path = win.location.pathname
    if (win.location.origin === origin && (path === base || path.startsWith(`${base}/`))) product = word
  }
  const host = win.location.hostname
  const suffix = `.${config.domain}`
  if (!product && host.endsWith(suffix)) {
    const word = host.slice(0, -suffix.length)
    if (config.products.includes(word)) product = word
  }
  // La coque, une fois montée, sait mieux que l'adresse : on ne réécrit pas son produit.
  if (product && !root.dataset.hgdcProduct) root.dataset.hgdcProduct = product
  product = root.dataset.hgdcProduct ?? ""

  let org: { initials?: unknown; logo?: unknown } | null = null
  try {
    org = JSON.parse(rawOrg ?? "null")
  } catch {
    org = null
  }
  const letters = org && typeof org.initials === "string" ? org.initials.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 4) : ""
  const logo =
    org && typeof org.logo === "string" && org.logo.length < 2048 && /^https:\/\/[^\s"'()\\]+$/.test(org.logo)
      ? org.logo
      : ""
  if (letters || logo) {
    root.dataset.hgdcOrg = ""
    root.style.setProperty("--hgdc-org-initials", logo ? '""' : `"${letters}"`)
    if (logo) root.style.setProperty("--hgdc-org-logo", `url("${logo}")`)
    else root.style.removeProperty("--hgdc-org-logo")
  } else {
    delete root.dataset.hgdcOrg
    root.style.removeProperty("--hgdc-org-initials")
    root.style.removeProperty("--hgdc-org-logo")
  }

  let height = 0
  try {
    height = product ? Number(win.localStorage.getItem(config.navKeyPrefix + product)) : 0
  } catch {
    height = 0
  }
  if (height > 0 && height < 2000) root.style.setProperty("--hgdc-nav-height", `${Math.round(height)}px`)
}

/** Configuration de la famille : les produits du kit et `PRODUCT_ORIGINS`. */
export const SHELL_BOOT_CONFIG: ShellBootConfig = {
  railKey: "sidebar",
  orgKey: SHELL_ORG_KEY,
  navKeyPrefix: SHELL_NAV_KEY_PREFIX,
  products: FAMILY_PRODUCTS,
  origins: Object.entries(PRODUCT_ORIGINS).map(([word, { origin, basePath }]) => [word, origin, basePath] as const),
  domain: "hgdc.ch",
}

/** Le script en ligne du `<head>` : `shellBoot` et sa configuration, sans dépendance. */
export function shellBootScript(config: ShellBootConfig = SHELL_BOOT_CONFIG): string {
  return `try{(${shellBoot.toString()})(${JSON.stringify(config)},window)}catch(e){}`
}

function browser(): BootWindow | null {
  return typeof window === "undefined" ? null : (window as unknown as BootWindow)
}

function storageSet(storage: "localStorage" | "sessionStorage", key: string, value: string | null): void {
  try {
    if (value === null) window[storage].removeItem(key)
    else window[storage].setItem(key, value)
  } catch {
    // Stockage bloqué : la première image d'un autre produit montrera un squelette, rien de plus.
  }
}

/** Ce que la coque retient d'une organisation : ses initiales et son logo (`https:` seulement). */
export function shellOrganization(org: { name: string; logo?: string | undefined }): ShellOrganization {
  return { initials: initials(org.name), ...(org.logo ? { logo: org.logo } : {}) }
}

/** Retient l'organisation affichée (`OrgSwitcher` le fait) et l'applique à la page. */
export function rememberShellOrganization(org: { name: string; logo?: string | undefined }): void {
  const win = browser()
  if (!win) return
  storageSet("localStorage", SHELL_ORG_KEY, JSON.stringify(shellOrganization(org)))
  shellBoot(SHELL_BOOT_CONFIG, win)
}

/** Oublie l'organisation (déconnexion) : la page suivante montre un squelette. */
export function forgetShellOrganization(): void {
  const win = browser()
  if (!win) return
  storageSet("localStorage", SHELL_ORG_KEY, null)
  shellBoot(SHELL_BOOT_CONFIG, win)
}

/** Retient la hauteur de la navigation d'un produit (`AppShell` le fait après l'affichage). */
export function rememberShellNavHeight(product: string, height: number): void {
  if (!browser() || !(height > 0)) return
  storageSet("localStorage", SHELL_NAV_KEY_PREFIX + product, String(Math.round(height)))
}

/** Note le départ vers un autre produit (clic dans la barre des produits). */
export function markProductSwitch(now: number = Date.now()): void {
  if (!browser()) return
  storageSet("sessionStorage", SHELL_SWITCH_KEY, String(now))
}

/** Lit et efface la note : vrai si la page vient d'un passage depuis la barre, il y a peu. */
export function takeProductSwitch(now: number = Date.now()): boolean {
  if (!browser()) return false
  let value: string | null = null
  try {
    value = window.sessionStorage.getItem(SHELL_SWITCH_KEY)
    window.sessionStorage.removeItem(SHELL_SWITCH_KEY)
  } catch {
    return false
  }
  const at = Number(value)
  return value !== null && at > 0 && now - at >= 0 && now - at < SHELL_SWITCH_MAX_AGE_MS
}
