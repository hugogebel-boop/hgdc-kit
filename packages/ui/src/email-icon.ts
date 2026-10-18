// Adresse des icônes des e-mails, sans React Email : un code serveur qui assemble son propre HTML
// (filigrane de Mail) l'importe sans tirer le modèle (`@hgdc/ui/email-icon`).
import { EMAIL_ICON_VERSION, isFamilyProduct } from "./family-svg.ts"

/**
 * Seule adresse des icônes des e-mails : hgdc.ch les sert depuis `packages/ui/email-icons/`, posées
 * à son build par `hgdc-brand emails public/email`.
 */
export const EMAIL_ICON_BASE = "https://hgdc.ch/email/"

/**
 * Icône en PNG du produit (`mail` → `https://hgdc.ch/email/mail.png?v=<empreinte>`). L'empreinte
 * change avec l'image : un client mail qui l'a gardée en cache charge la nouvelle.
 */
export function emailIconUrl(word: string): string {
  const product = word.toLowerCase()
  const url = `${EMAIL_ICON_BASE}${product}.png`
  return isFamilyProduct(product) ? `${url}?v=${EMAIL_ICON_VERSION[product]}` : url
}
