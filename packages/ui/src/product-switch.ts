import { useEffect } from "react"

/*
 * Passage d'un produit à l'autre (ADR 0016, 0020) : la barre des produits pointe vers
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

/** Marque d'un lien de la barre vers un autre produit servi sous la même origine : prérendu au survol. */
export const PRODUCT_PRERENDER_ATTRIBUTE = "data-hgdc-prerender"

/**
 * Règles de spéculation posées par la coque (Chrome et Edge ; ignorées ailleurs) :
 *
 * - **prérendu** au survol (`eagerness: "moderate"`, environ 200 ms) des liens marqués
 *   `PRODUCT_PRERENDER_ATTRIBUTE` vers l'entrée `refresh=background` d'un produit de la même
 *   origine (`app.hgdc.ch/<produit>`) : le motif est relatif, il ne vaut que pour l'origine de la
 *   page. L'entrée ne rend que la redirection d'une session ouverte ; sans session, elle répond 503
 *   à une requête `Sec-Purpose: prefetch;prerender`, le prérendu est jeté et le clic repart
 *   normalement. La page prérendue attend d'être affichée pour relire les organisations.
 * - **préchargement** seul de l'entrée d'un produit encore sur son sous-domaine (même site, les
 *   cookies partent), comme avant (ADR 0016).
 */
export const PRODUCT_SPECULATION_RULES: string = JSON.stringify({
  prerender: [
    {
      source: "document",
      where: {
        and: [
          { selector_matches: `a[${PRODUCT_PRERENDER_ATTRIBUTE}]` },
          { href_matches: "/*/auth/hgdc?refresh=background*" },
        ],
      },
      eagerness: "moderate",
    },
  ],
  prefetch: [
    {
      source: "document",
      where: { href_matches: "https://*.hgdc.ch/auth/hgdc?refresh=background*" },
      eagerness: "moderate",
    },
  ],
})

/** @deprecated Remplacé par `PRODUCT_SPECULATION_RULES` (prérendu sous la même origine, 0.38). */
export const PRODUCT_PREFETCH_RULES: string = PRODUCT_SPECULATION_RULES

/** Base de chemin d'un produit (`/analytics`), telle que l'entrée la pose dans le cookie. */
const BASE_PATH = /^(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/

/**
 * Lit et efface le cookie de relecture. Rend la base de chemin du produit (`""` à la racine de son
 * origine, `"/analytics"` sous `app.hgdc.ch/analytics`), `null` s'il n'était pas posé. Sous une
 * base, l'entrée le limite à ce chemin : un autre produit de la même origine ne le voit pas.
 */
export function takeOrgSync(doc: Document = document): string | null {
  let base: string | null = null
  for (const part of doc.cookie.split(";")) {
    const [name, value] = part.trim().split("=", 2)
    if (name !== ORG_SYNC_COOKIE || value === undefined) continue
    if (value === "1") base = ""
    else if (BASE_PATH.test(value)) base = value
    if (base !== null) break
  }
  if (base !== null) {
    const secure = doc.location.protocol === "https:" ? "; Secure" : ""
    doc.cookie = `${ORG_SYNC_COOKIE}=; Path=${base || "/"}; Max-Age=0; SameSite=Lax${secure}`
  }
  return base
}

/** Lit et efface le cookie de relecture. Vrai s'il était posé. */
export function takeOrgSyncCookie(doc: Document = document): boolean {
  return takeOrgSync(doc) !== null
}

/**
 * Relit les organisations dans un cadre caché, une fois, si l'entrée l'a demandé. Le cadre n'a
 * ni script ni formulaire (`sandbox`), il suit seulement les redirections d'Account ; la nouvelle
 * session du produit recopie les organisations, et les requêtes Convex abonnées se mettent à jour.
 * Si la session d'Account a expiré, Account refuse d'être affiché dans un cadre : rien ne se passe,
 * la session du produit reste celle d'avant. Une page prérendue au survol attend d'être affichée :
 * un survol sans clic ne relit rien.
 */
export function startBackgroundRefresh(doc: Document = document): HTMLIFrameElement | null {
  if ((doc as Document & { prerendering?: boolean }).prerendering) {
    doc.addEventListener("prerenderingchange", () => startBackgroundRefresh(doc), { once: true })
    return null
  }
  const base = takeOrgSync(doc)
  if (base === null) return null
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
  frame.src = `${base}${BACKGROUND_REFRESH_PATH}`
  doc.body.append(frame)
  return frame
}

/**
 * Relecture en arrière-plan si l'entrée l'a demandé. Montée à la racine du document
 * (`FamilyLoaderRoot`), pour toutes les pages, y compris celles hors de la coque : la page « il te
 * faut une organisation » d'une personne qui vient d'accepter une invitation en a le plus besoin.
 * Le cadre vit hors de l'arbre React : un démontage ne l'interrompt pas, il se retire seul.
 */
export function useBackgroundOrganizationRefresh(): void {
  useEffect(() => {
    startBackgroundRefresh()
  }, [])
}

/**
 * Dans la coque (`AppShell` le fait) : la relecture ci-dessus si la racine ne l'a pas déjà faite
 * (le cookie ne sert qu'une fois), et le prérendu ou le préchargement au survol des autres
 * produits. Les règles sont un `<script type="speculationrules">` en ligne : une CSP qui pose
 * `script-src` doit y autoriser `'inline-speculation-rules'` (README).
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
    script.textContent = PRODUCT_SPECULATION_RULES
    document.head.append(script)
    return () => script.remove()
  }, [enabled])
}
