import Activity01Icon from "@hugeicons/core-free-icons/Activity01Icon"
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon"
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon"
import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon"
import Briefcase01Icon from "@hugeicons/core-free-icons/Briefcase01Icon"
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon"
import Rocket01Icon from "@hugeicons/core-free-icons/Rocket01Icon"
import UserGroupIcon from "@hugeicons/core-free-icons/UserGroupIcon"
import UserCircleIcon from "@hugeicons/core-free-icons/UserCircleIcon"
import type { IconSvgElement } from "@hugeicons/react"

import { APP_ORIGIN, APP_PRODUCTS, isAppProduct, soloOrigin, type ProductView } from "./addresses.ts"
import { HGDC_EMAIL_ACCENT, type EmailAccent } from "./email-palette.ts"
import { isFamilyProduct, type FamilyProduct } from "./family-svg.ts"

/** Où en est un produit : seul ce qui répond s'ouvre depuis les menus. */
export type ProductStage = "live" | "preview" | "soon"

export const PRODUCT_STAGE_LABEL: Readonly<Record<ProductStage, string>> = {
  live: "En service",
  preview: "Préversion",
  soon: "Bientôt",
}

/** Un produit de la famille, tel que la vision le décrit. */
export type HgdcCatalogProduct = {
  /** Le mot du produit, qui sert de sous-domaine : « Host ». */
  word: string
  /** Nom affiché : celui du module de Basalte (« Déploiements » pour `host`), sinon le mot seul. */
  name: string
  /** « host.hgdc.ch ». */
  subdomain: string
  /** Page d'accueil publique : `https://host.hgdc.ch`. */
  href: string
  /**
   * Entrée dans l'app avec la session HGDC Account (`PRODUCT_ENTRY_PATH`), sans page d'accueil
   * ni bouton de connexion : `https://<mot>.hgdc.ch/auth/hgdc?refresh=background&next=/`. Avec une
   * session du produit ouverte, on arrive tout de suite et les organisations se relisent en
   * arrière-plan (une organisation rejointe dans Account apparaît sans se reconnecter, ADR 0013,
   * 0016). Pour Account, sa racine.
   */
  entryHref: string
  /**
   * Page du produit sur le site : `https://hgdc.ch/logiciels/<mot>`. Absente tant que le produit
   * est « soon » : sa page n'existe pas encore.
   */
  productPage?: string | undefined
  /** Une phrase, au tutoiement. */
  pitch: string
  /** Pastille du produit (`ProductBadge` de `@hgdc/ui/product-badge`) : le mot en minuscules. */
  badge: FamilyProduct
  /** Pictogramme Hugeicons, pour une liste qui en veut un (palette, navigation). Le logo est `badge`. */
  icon: IconSvgElement
  stage: ProductStage
  /**
   * Accent du produit en hex, pour ce qui ne lit pas les jetons CSS (e-mails). Absent : l'accent
   * violet de la DA. Tous les produits le partagent aujourd'hui ; un écart se décide ici.
   */
  accent?: EmailAccent | undefined
}

/**
 * Chemin de l'entrée commune des produits, le `HGDC_ENTRY_PATH` de `@hgdc/auth` : chaque produit
 * le monte (`createHgdcEntry`). Il ouvre l'app avec la session HGDC Account, sans formulaire
 * quand cette session existe.
 */
/** Base des pages produit du site : `<base>/<mot>`. */
export const PRODUCT_PAGE_BASE = "https://hgdc.ch/logiciels"

export const PRODUCT_ENTRY_PATH = "/auth/hgdc"

/** Où un produit est servi : l'origine et, s'il partage son hôte avec d'autres, sa base de chemin. */
export type ProductOrigin = { origin: string; basePath: string }

/**
 * Adresse de l'app de chaque produit servi sous `https://app.hgdc.ch/<mot>`, par mot en minuscules,
 * déduite d'`APP_PRODUCTS` (`@hgdc/ui/addresses`). Un autre produit reste à `https://<mot>.hgdc.ch`
 * sans base.
 *
 * Ne change que l'entrée dans l'app (`entryHref`, menus et barre) : la page d'accueil publique
 * (`href`) reste `https://<mot>.hgdc.ch`.
 */
export const PRODUCT_ORIGINS: Readonly<Record<string, ProductOrigin>> = Object.fromEntries(
  APP_PRODUCTS.map((word) => [word, { origin: APP_ORIGIN, basePath: `/${word}` }]),
)

/** Adresse de l'app d'un produit : celle de `PRODUCT_ORIGINS`, sinon `https://<mot>.hgdc.ch`. */
export function productOrigin(
  word: string,
  origins: Readonly<Record<string, ProductOrigin>> = PRODUCT_ORIGINS,
): ProductOrigin {
  const key = word.toLowerCase()
  return Object.hasOwn(origins, key) ? origins[key]! : { origin: `https://${key}.hgdc.ch`, basePath: "" }
}

/**
 * Entrée dans l'app d'un produit avec la session HGDC : `https://app.hgdc.ch/analytics/auth/hgdc?refresh=background&next=/`.
 * Avec `organization` (slug de la dernière organisation ouverte), l'entrée mène droit à
 * `/o/<organisation>` : sans les redirections de l'accueil (`/`, puis `/dashboard` ou `/o/…`).
 */
export function productEntryHref(
  word: string,
  origins: Readonly<Record<string, ProductOrigin>> = PRODUCT_ORIGINS,
  organization?: string | null,
): string {
  const app = productOrigin(word, origins)
  return `${app.origin}${app.basePath}${PRODUCT_ENTRY_PATH}?${productEntryQuery(word, organization)}`
}

/**
 * Requête de l'entrée depuis un autre produit : arriver sur l'accueil, relire les organisations en
 * arrière-plan (`refresh=background`, ADR 0016).
 */
export const PRODUCT_ENTRY_REFRESH_QUERY = "refresh=background&next=/"

/** Slug d'organisation tel que les produits l'écrivent dans `/o/<slug>` : rien d'autre ne part dans `next`. */
const ORGANIZATION_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

/** Produits dont `/o/<slug>` est la page d'une organisation. Manager les désigne par leur identifiant. */
function opensOrganizationBySlug(word: string): boolean {
  return word.toLowerCase() !== "manager"
}

/** Requête de l'entrée : `refresh=background` toujours en tête (règles de prérendu), `next` vers l'organisation si connue. */
export function productEntryQuery(word: string, organization?: string | null): string {
  if (!organization || !ORGANIZATION_SLUG.test(organization) || !opensOrganizationBySlug(word))
    return PRODUCT_ENTRY_REFRESH_QUERY
  return `refresh=background&next=${encodeURIComponent(`/o/${organization}`)}`
}

function product(
  word: string,
  pitch: string,
  icon: IconSvgElement,
  stage: ProductStage,
  /** Nom affiché quand il diffère du mot de l'adresse : le nom du module (« Déploiements » pour `host`). */
  name = word,
): HgdcCatalogProduct {
  const badge = word.toLowerCase()
  if (!isFamilyProduct(badge)) throw new Error(`@hgdc/ui/products : pas de pastille pour « ${word} »`)
  const subdomain = `${badge}.hgdc.ch`
  const href = `https://${subdomain}`
  return {
    word,
    name,
    subdomain,
    href,
    entryHref: productEntryHref(badge),
    ...(stage === "soon" ? {} : { productPage: `${PRODUCT_PAGE_BASE}/${badge}` }),
    pitch,
    badge,
    icon,
    stage,
    accent: HGDC_EMAIL_ACCENT,
  }
}

/**
 * Le compte commun (profil, sécurité), hors du catalogue des produits. Adresse et pastille gardent
 * le mot `account` ; le nom affiché est ID (ADR 0015 du dépôt `hgdc`).
 */
const account = product(
  "Account",
  "Ton compte : profil, sécurité et organisations, pour tous les produits de la famille.",
  UserCircleIcon,
  "live",
  "ID",
)
export const HGDC_ACCOUNT: HgdcCatalogProduct = { ...account, entryHref: account.href }

/** Manager : les organisations, leurs membres et leurs rôles. En tête du menu et de la barre des produits. */
export const HGDC_MANAGER: HgdcCatalogProduct = product(
  "Manager",
  "Tes organisations, leurs membres et leurs rôles.",
  UserGroupIcon,
  "live",
)

/** Les produits de la famille, dans leur ordre d'affichage. Account n'en fait pas partie (`HGDC_ACCOUNT`). */
export const HGDC_PRODUCTS: ReadonlyArray<HgdcCatalogProduct> = [
  // Basalte est le produit ; chacun de ceux-ci y est un module, sous son nom de fonction. Adresses, pastille et clés gardent le mot.
  product("Host", "Ton site en ligne, déployé à chaque modification.", Rocket01Icon, "live", "Déploiements"),
  product(
    "Mail",
    "Tes e-mails, newsletters et formulaires, envoyés depuis ton adresse.",
    Mail01Icon,
    "live",
    "E-mails",
  ),
  // Masqué temporairement le 2026-11-03 ; la console reste en ligne.
  product("Portal", "Un espace partagé où ton client suit son projet, signe et paie.", Briefcase01Icon, "soon"),
  product("Status", "La surveillance de tes sites et ta page de statut.", Activity01Icon, "live", "Surveillance"),
  product("Analytics", "Tes visiteurs mesurés, sans cookies ni bannière.", Analytics01Icon, "live", "Statistiques"),
  product(
    "Docs",
    "Ta documentation en ligne, avec un assistant qui y répond.",
    BookOpen01Icon,
    "live",
    "Documentation",
  ),
  product(
    "IAssistant",
    "Une bulle de chat IA sur ton site, qui répond à tes visiteurs.",
    BubbleChatIcon,
    "preview",
    "Assistant IA",
  ),
  id(),
  HGDC_MANAGER,
]

/** ID, le compte de connexion ouvert aux applications tierces : pas d'entrée `/auth/hgdc`, sa racine. */
function id(): HgdcCatalogProduct {
  const item = product("ID", "Ton compte pour te connecter à tes applications.", UserCircleIcon, "live", "Connexion")
  return { ...item, entryHref: item.href }
}

/** Vrai si le produit répond déjà (en service ou en préversion). */
export function isProductOpen(item: Pick<HgdcCatalogProduct, "stage">): boolean {
  return item.stage !== "soon"
}

/** Une entrée du menu « Produits » d'`AccountMenu`. */
export type ProductMenuEntry = {
  name: string
  href: string
  /** Le produit ouvert : coché, sans lien. */
  current?: boolean
  /** Pastille du produit, affichée à la place de `icon`. */
  badge?: FamilyProduct
  icon?: IconSvgElement
  /** Texte discret à droite : « Préversion ». */
  hint?: string
}

/**
 * Les entrées du menu du compte : Manager d'abord, puis les autres produits ouverts. `current` est le
 * mot du produit affiché (« Mail ») : il est coché. `accountHref` remplace l'adresse de Manager
 * (un Manager local en développement). Chaque produit pointe vers son entrée (`entryHref`) :
 * un clic ouvre l'app avec la session HGDC, pas la page d'accueil publique.
 */
export function productMenuEntries(
  options: {
    current?: string | undefined
    accountHref?: string | undefined
    catalog?: ReadonlyArray<HgdcCatalogProduct> | undefined
  } = {},
): Array<ProductMenuEntry> {
  const current = options.current?.toLowerCase()
  const { manager, others } = managerFirst(options.catalog ?? HGDC_PRODUCTS)
  const local = localManagerHref(options.accountHref)
  const head = manager && local ? { ...manager, entryHref: local } : manager
  return [...(head ? [head] : []), ...others.filter(isProductOpen)].map((item) => ({
    name: item.name,
    href: item.entryHref,
    badge: item.badge,
    icon: item.icon,
    ...(item.word.toLowerCase() === current ? { current: true } : {}),
    ...(item.stage === "preview" ? { hint: PRODUCT_STAGE_LABEL.preview } : {}),
  }))
}

/**
 * Chemin de `href` s'il est servi sous `pageOrigin` (`/mail/auth/hgdc?…` depuis
 * `https://app.hgdc.ch`), sinon `null`. Sans origine connue (rendu serveur), `null`.
 */
export function sameOriginPath(href: string, pageOrigin: string | undefined): string | null {
  if (!pageOrigin) return null
  try {
    const url = new URL(href)
    return url.origin === pageOrigin ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}

/** Une entrée de la barre des produits d'`AppShell`. */
export type ShellProductEntry = {
  name: string
  href: string
  badge: FamilyProduct
  /** Le produit ouvert : « vous êtes ici », lien vers sa propre racine. */
  current?: boolean
  /** Texte discret sous le nom : « Préversion ». */
  hint?: string
  /**
   * Produit servi sous la même origine que la page : lien relatif, prérendu au survol
   * (`PRODUCT_PRERENDER_ATTRIBUTE` de `@hgdc/ui/product-switch`) et transition de vue.
   */
  sameOrigin?: boolean
}

/**
 * Les entrées de la barre des produits : Manager, affiché en tête, puis les autres produits ouverts du
 * catalogue. Chaque produit pointe vers son entrée
 * `/auth/hgdc?refresh=background&next=/` (ADR 0010, 0013, 0016), Manager aussi, ou vers `accountHref` en
 * développement. Le produit courant pointe vers sa racine, sans détour par l'entrée.
 *
 * `pageOrigin` (`location.origin`, absent au rendu serveur) : un produit servi sous cette origine
 * (`PRODUCT_ORIGINS`, `app.hgdc.ch/<produit>`) reçoit un lien relatif et `sameOrigin` (ADR 0020),
 * et le produit courant sa base (`/mail/`) plutôt que `/`.
 */
export function shellProductEntries(
  options: {
    current?: string | undefined
    accountHref?: string | undefined
    catalog?: ReadonlyArray<HgdcCatalogProduct> | undefined
    pageOrigin?: string | undefined
    /** Dernière organisation ouverte (`lastOrganization()`, absente au rendu serveur) : l'entrée y mène droit. */
    organization?: string | null | undefined
  } = {},
): { products: Array<ShellProductEntry>; account: ShellProductEntry } {
  const current = options.current?.toLowerCase()
  const { pageOrigin, organization } = options
  const entry = (item: HgdcCatalogProduct, href: string, product: boolean): ShellProductEntry => {
    const base = {
      name: item.name,
      badge: item.badge,
      ...(item.stage === "preview" ? { hint: PRODUCT_STAGE_LABEL.preview } : {}),
    }
    if (item.badge === current) {
      const app = productOrigin(item.badge)
      return { ...base, href: pageOrigin === app.origin ? `${app.basePath}/` : "/", current: true }
    }
    const path = product ? sameOriginPath(href, pageOrigin) : null
    return path === null ? { ...base, href } : { ...base, href: path, sameOrigin: true }
  }
  const { manager, others } = managerFirst(options.catalog ?? HGDC_PRODUCTS)
  const head = manager ?? HGDC_MANAGER
  const local = localManagerHref(options.accountHref)
  return {
    products: others
      .filter(isProductOpen)
      .map((item) =>
        entry(item, organization ? productEntryHref(item.badge, PRODUCT_ORIGINS, organization) : item.entryHref, true),
      ),
    account: entry(head, local ?? head.entryHref, local === undefined),
  }
}

/** Manager du catalogue, s'il y est, sorti des autres produits : il prend la place d'Account en tête. */
/**
 * L'adresse reçue, seulement pour un Manager local : en production, les consoles passent l'adresse
 * d'ID (`id.hgdc.ch`, avant `account.hgdc.ch`), qui n'est pas Manager. Toute adresse `https` sous
 * `hgdc.ch` garde donc le Manager du catalogue.
 */
function localManagerHref(accountHref: string | undefined): string | undefined {
  if (!accountHref) return undefined
  try {
    const { protocol, hostname } = new URL(accountHref)
    return protocol === "https:" && (hostname === "hgdc.ch" || hostname.endsWith(".hgdc.ch")) ? undefined : accountHref
  } catch {
    return undefined
  }
}

function managerFirst(catalog: ReadonlyArray<HgdcCatalogProduct>): {
  manager: HgdcCatalogProduct | undefined
  others: Array<HgdcCatalogProduct>
} {
  const manager = catalog.find((item) => item.badge === "manager" && isProductOpen(item))
  return { manager, others: catalog.filter((item) => item !== manager) }
}

/**
 * Lien vers l'autre vue du même produit (ADR 0014) : depuis `app.hgdc.ch/<mot>`, « Ouvrir seul » vers
 * `<mot>.hgdc.ch` ; depuis `<mot>.hgdc.ch`, « Ouvrir dans app.hgdc.ch ». Passe par l'entrée
 * (`/auth/hgdc?next=<chemin>`) : la session de l'autre origine s'ouvre sans clic si celle
 * d'Account vit. `path` est un chemin du produit, sans la base ; un autre texte mène à l'accueil.
 * `null` pour un produit qui n'a pas deux vues.
 */
export function otherViewHref(word: string, view: ProductView, path = "/"): string | null {
  const key = word.toLowerCase()
  if (!isAppProduct(key)) return null
  const next = path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/"
  const target = view === "app" ? soloOrigin(key) : `${APP_ORIGIN}/${key}`
  return `${target}${PRODUCT_ENTRY_PATH}?next=${encodeURIComponent(next)}`
}

/** Libellé du lien vers l'autre vue. */
export function otherViewLabel(view: ProductView): string {
  return view === "app" ? "Ouvrir seul" : "Ouvrir dans app.hgdc.ch"
}
