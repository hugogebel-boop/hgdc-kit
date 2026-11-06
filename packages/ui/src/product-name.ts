import type { FamilyProduct } from "./family-svg.ts"
import { HGDC_ACCOUNT, HGDC_PRODUCTS } from "./products.ts"

/** Nom affiché d'un produit de la famille (« E-mails » pour `mail`), Account compris. */
export function familyProductName(product: FamilyProduct): string {
  if (product === HGDC_ACCOUNT.badge) return HGDC_ACCOUNT.name
  return HGDC_PRODUCTS.find((item) => item.badge === product)?.name ?? product
}
