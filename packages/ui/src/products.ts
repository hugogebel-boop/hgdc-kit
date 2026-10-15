import Activity01Icon from "@hugeicons/core-free-icons/Activity01Icon"
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon"
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon"
import Briefcase01Icon from "@hugeicons/core-free-icons/Briefcase01Icon"
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon"
import Rocket01Icon from "@hugeicons/core-free-icons/Rocket01Icon"
import UserCircleIcon from "@hugeicons/core-free-icons/UserCircleIcon"
import type { IconSvgElement } from "@hugeicons/react"

/** Où en est un produit : seul ce qui répond s'ouvre depuis les menus. */
export type ProductStage = "live" | "preview" | "soon"

export const PRODUCT_STAGE_LABEL: Readonly<Record<ProductStage, string>> = {
  live: "En service",
  preview: "Préversion",
  soon: "Bientôt",
}

/** Un produit de la famille, tel que la vision le décrit. */
export type HgdcCatalogProduct = {
  /** Le mot de « HGDC <mot> » : « Host ». */
  word: string
  /** « HGDC Host ». */
  name: string
  /** « host.hgdc.ch ». */
  subdomain: string
  href: string
  /** Une phrase, au tutoiement. */
  pitch: string
  icon: IconSvgElement
  stage: ProductStage
}

function product(word: string, pitch: string, icon: IconSvgElement, stage: ProductStage): HgdcCatalogProduct {
  const subdomain = `${word.toLowerCase()}.hgdc.ch`
  return { word, name: `HGDC ${word}`, subdomain, href: `https://${subdomain}`, pitch, icon, stage }
}

/** HGDC Account : le compte commun (profil, sécurité, organisations), hors du catalogue des produits. */
export const HGDC_ACCOUNT: HgdcCatalogProduct = product(
  "Account",
  "Ton compte HGDC : profil, sécurité et organisations, pour tous les produits.",
  UserCircleIcon,
  "live",
)

/** Les produits de la famille, dans leur ordre d'affichage. Account n'en fait pas partie (`HGDC_ACCOUNT`). */
export const HGDC_PRODUCTS: ReadonlyArray<HgdcCatalogProduct> = [
  product("Host", "Ton site en ligne, déployé à chaque modification.", Rocket01Icon, "preview"),
  product("Mail", "Tes e-mails, newsletters et formulaires, envoyés depuis ton adresse.", Mail01Icon, "live"),
  product("Portal", "Un espace partagé où ton client suit son projet, signe et paie.", Briefcase01Icon, "soon"),
  product("Status", "La surveillance de tes sites et ta page de statut.", Activity01Icon, "soon"),
  product("Analytics", "Tes visiteurs mesurés, sans cookies ni bannière.", Analytics01Icon, "soon"),
  product("Docs", "Ta documentation en ligne, avec un assistant qui y répond.", BookOpen01Icon, "soon"),
]

/** Vrai si le produit répond déjà (en service ou en préversion). */
export function isProductOpen(item: Pick<HgdcCatalogProduct, "stage">): boolean {
  return item.stage !== "soon"
}

/** Une entrée du menu « Produits HGDC » d'`AccountMenu`. */
export type ProductMenuEntry = {
  name: string
  href: string
  /** Le produit ouvert : coché, sans lien. */
  current?: boolean
  icon?: IconSvgElement
  /** Texte discret à droite : « Préversion ». */
  hint?: string
}

/**
 * Les entrées du menu du compte : Account d'abord, puis les produits ouverts. `current` est le
 * mot du produit affiché (« Mail ») : il est coché. `accountHref` remplace l'adresse d'Account
 * (un Account local en développement).
 */
export function productMenuEntries(
  options: {
    current?: string | undefined
    accountHref?: string | undefined
    catalog?: ReadonlyArray<HgdcCatalogProduct> | undefined
  } = {},
): Array<ProductMenuEntry> {
  const current = options.current?.toLowerCase()
  const account = { ...HGDC_ACCOUNT, href: options.accountHref ?? HGDC_ACCOUNT.href }
  return [account, ...(options.catalog ?? HGDC_PRODUCTS).filter(isProductOpen)].map((item) => ({
    name: item.name,
    href: item.href,
    icon: item.icon,
    ...(item.word.toLowerCase() === current ? { current: true } : {}),
    ...(item.stage === "preview" ? { hint: PRODUCT_STAGE_LABEL.preview } : {}),
  }))
}
