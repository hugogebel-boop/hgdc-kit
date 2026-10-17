import Activity01Icon from "@hugeicons/core-free-icons/Activity01Icon"
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon"
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon"
import Briefcase01Icon from "@hugeicons/core-free-icons/Briefcase01Icon"
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon"
import Rocket01Icon from "@hugeicons/core-free-icons/Rocket01Icon"
import UserCircleIcon from "@hugeicons/core-free-icons/UserCircleIcon"
import type { IconSvgElement } from "@hugeicons/react"

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
  /** Nom affiché, le mot seul (« Host ») : la famille ne se répète pas devant chaque produit. */
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
export const PRODUCT_ENTRY_PATH = "/auth/hgdc"

/**
 * Requête de l'entrée depuis un autre produit : arriver sur l'accueil, relire les organisations en
 * arrière-plan (`refresh=background`, ADR 0016).
 */
export const PRODUCT_ENTRY_REFRESH_QUERY = "refresh=background&next=/"

function product(word: string, pitch: string, icon: IconSvgElement, stage: ProductStage): HgdcCatalogProduct {
  const badge = word.toLowerCase()
  if (!isFamilyProduct(badge)) throw new Error(`@hgdc/ui/products : pas de pastille pour « ${word} »`)
  const subdomain = `${badge}.hgdc.ch`
  const href = `https://${subdomain}`
  return {
    word,
    name: word,
    subdomain,
    href,
    entryHref: `${href}${PRODUCT_ENTRY_PATH}?${PRODUCT_ENTRY_REFRESH_QUERY}`,
    pitch,
    badge,
    icon,
    stage,
    accent: HGDC_EMAIL_ACCENT,
  }
}

/** HGDC Account : le compte commun (profil, sécurité, organisations), hors du catalogue des produits. */
const account = product(
  "Account",
  "Ton compte : profil, sécurité et organisations, pour tous les produits de la famille.",
  UserCircleIcon,
  "live",
)
export const HGDC_ACCOUNT: HgdcCatalogProduct = { ...account, entryHref: account.href }

/** Les produits de la famille, dans leur ordre d'affichage. Account n'en fait pas partie (`HGDC_ACCOUNT`). */
export const HGDC_PRODUCTS: ReadonlyArray<HgdcCatalogProduct> = [
  product("Host", "Ton site en ligne, déployé à chaque modification.", Rocket01Icon, "preview"),
  product("Mail", "Tes e-mails, newsletters et formulaires, envoyés depuis ton adresse.", Mail01Icon, "live"),
  product("Portal", "Un espace partagé où ton client suit son projet, signe et paie.", Briefcase01Icon, "live"),
  product("Status", "La surveillance de tes sites et ta page de statut.", Activity01Icon, "live"),
  product("Analytics", "Tes visiteurs mesurés, sans cookies ni bannière.", Analytics01Icon, "live"),
  product("Docs", "Ta documentation en ligne, avec un assistant qui y répond.", BookOpen01Icon, "live"),
]

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
 * Les entrées du menu du compte : Account d'abord, puis les produits ouverts. `current` est le
 * mot du produit affiché (« Mail ») : il est coché. `accountHref` remplace l'adresse d'Account
 * (un Account local en développement). Chaque produit pointe vers son entrée (`entryHref`) :
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
  const accountHref = options.accountHref ?? HGDC_ACCOUNT.entryHref
  const account = { ...HGDC_ACCOUNT, href: accountHref, entryHref: accountHref }
  return [account, ...(options.catalog ?? HGDC_PRODUCTS).filter(isProductOpen)].map((item) => ({
    name: item.name,
    href: item.entryHref,
    badge: item.badge,
    icon: item.icon,
    ...(item.word.toLowerCase() === current ? { current: true } : {}),
    ...(item.stage === "preview" ? { hint: PRODUCT_STAGE_LABEL.preview } : {}),
  }))
}

/** Une entrée de la barre des produits d'`AppShell`. */
export type ProductRailEntry = {
  name: string
  href: string
  badge: FamilyProduct
  /** Le produit ouvert : « vous êtes ici », lien vers sa propre racine. */
  current?: boolean
  /** Texte discret sous le nom : « Préversion ». */
  hint?: string
}

/**
 * Les entrées de la barre des produits : les produits ouverts du catalogue et Account, affiché en
 * tête (le compte commun, pas un produit). Chaque produit pointe vers son entrée
 * `/auth/hgdc?refresh=background&next=/` (ADR 0010, 0013, 0016), Account vers sa racine (`accountHref` en
 * développement). Le produit courant pointe vers `/`, sans détour par l'entrée.
 */
export function productRailEntries(
  options: {
    current?: string | undefined
    accountHref?: string | undefined
    catalog?: ReadonlyArray<HgdcCatalogProduct> | undefined
  } = {},
): { products: Array<ProductRailEntry>; account: ProductRailEntry } {
  const current = options.current?.toLowerCase()
  const entry = (item: HgdcCatalogProduct, href: string): ProductRailEntry => ({
    name: item.name,
    badge: item.badge,
    ...(item.badge === current ? { href: "/", current: true } : { href }),
    ...(item.stage === "preview" ? { hint: PRODUCT_STAGE_LABEL.preview } : {}),
  })
  return {
    products: (options.catalog ?? HGDC_PRODUCTS).filter(isProductOpen).map((item) => entry(item, item.entryHref)),
    account: entry(HGDC_ACCOUNT, options.accountHref ?? HGDC_ACCOUNT.entryHref),
  }
}
