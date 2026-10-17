import { useEffect } from "react"

/*
 * Passage d'un produit à l'autre (ADR 0016) : la barre des produits pointe vers
 * `/auth/hgdc?refresh=background&next=/`. Avec une session du produit ouverte, l'entrée de
 * `@hgdc/auth` va droit à la page et pose un cookie « relire les organisations » ; la coque le lit
 * ici et relit les organisations dans un cadre caché, sans faire attendre la personne.
 *
 * Les trois noms ci-dessous sont ceux de `@hgdc/auth` (`HGDC_ORG_SYNC_COOKIE`,
 * `HGDC_BACKGROUND_REFRESH_PATH`, `HGDC_ENTRY_REFRESH_BACKGROUND`) : `@hgdc/ui` n'en dépend pas,
 * un test de `@hgdc/auth` vérifie qu'ils restent égaux.
 */

/** Cookie posé par l'entrée : relire les organisations en arrière-plan. */
export const ORG_SYNC_COOKIE = "hgdc-org-sync"

/** Cadre caché de la relecture : l'entrée repasse par Account, retour sur une réponse vide. */
export const BACKGROUND_REFRESH_PATH = "/auth/hgdc?refresh=1&frame=1"

/** Abandon du cadre s'il ne s'est pas chargé : Account injoignable, réseau coupé. */
export const BACKGROUND_REFRESH_TIMEOUT_MS = 20_000

/**
 * Liens préchargés au survol : l'entrée d'un autre produit en `refresh=background`. Elle ne fait
 * que lire la session et rediriger ; sans session, elle répond 503 à un préchargement (rien n'est
 * créé), et le clic repart normalement. Jamais de `prerender` : la page d'arrivée lit un cookie et
 * ouvre un cadre, ce qu'un prérendu ferait pour un simple survol.
 */
export const PRODUCT_PREFETCH_RULES: string = JSON.stringify({
  prefetch: [
    {
      source: "document",
      where: { href_matches: "https://*.hgdc.ch/auth/hgdc?refresh=background*" },
      eagerness: "moderate",
    },
  ],
})

/** Lit et efface le cookie de relecture. Vrai s'il était posé. */
export function takeOrgSyncCookie(doc: Document = document): boolean {
  const present = doc.cookie.split(";").some((part) => part.trim() === `${ORG_SYNC_COOKIE}=1`)
  if (present) {
    const secure = doc.location.protocol === "https:" ? "; Secure" : ""
    doc.cookie = `${ORG_SYNC_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  }
  return present
}

/**
 * Relit les organisations dans un cadre caché, une fois, si l'entrée l'a demandé. Le cadre n'a
 * ni script ni formulaire (`sandbox`), il suit seulement les redirections d'Account ; la nouvelle
 * session du produit recopie les organisations, et les requêtes Convex abonnées se mettent à jour.
 * Si la session d'Account a expiré, Account refuse d'être affiché dans un cadre : rien ne se passe,
 * la session du produit reste celle d'avant.
 */
export function startBackgroundRefresh(doc: Document = document): HTMLIFrameElement | null {
  if (!takeOrgSyncCookie(doc)) return null
  const frame = doc.createElement("iframe")
  frame.hidden = true
  frame.tabIndex = -1
  frame.title = ""
  frame.setAttribute("aria-hidden", "true")
  // Même origine pour les cookies du produit ; ni script, ni formulaire, ni navigation de la page.
  frame.setAttribute("sandbox", "allow-same-origin")
  frame.referrerPolicy = "no-referrer"
  const done = () => {
    window.clearTimeout(timer)
    frame.remove()
  }
  const timer = window.setTimeout(done, BACKGROUND_REFRESH_TIMEOUT_MS)
  frame.addEventListener("load", done, { once: true })
  frame.src = BACKGROUND_REFRESH_PATH
  doc.body.append(frame)
  return frame
}

/**
 * À monter une fois par document dans la coque (`AppShell` le fait) : relecture en arrière-plan
 * après un passage depuis la barre, et préchargement au survol des autres produits. Le cadre vit
 * hors de l'arbre React : un démontage ne l'interrompt pas, il se retire seul.
 */
export function useProductSwitch(enabled = true): void {
  useEffect(() => {
    if (enabled) startBackgroundRefresh()
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (typeof HTMLScriptElement === "undefined" || !HTMLScriptElement.supports?.("speculationrules")) return
    // Créé par le DOM, pas par React : un script inséré par `innerHTML` n'est jamais lu.
    const script = document.createElement("script")
    script.type = "speculationrules"
    script.textContent = PRODUCT_PREFETCH_RULES
    document.head.append(script)
    return () => script.remove()
  }, [enabled])
}
