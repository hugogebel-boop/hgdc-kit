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

/**
 * Une relecture au plus par produit pendant ce délai. Elle refait une connexion complète chez ID
 * (environ 3 s côté serveur, pendant le chargement de la page) : la refaire à chaque passage d'un
 * produit à l'autre ralentissait la navigation (2026-11-11). Les changements d'appartenance arrivent
 * déjà en direct par les événements d'Account ; la relecture n'est qu'un filet.
 */
export const BACKGROUND_REFRESH_INTERVAL_MS: number = 10 * 60_000

/** Heure de la dernière relecture d'un produit, en `localStorage` : `hgdc-org-sync:<base>` (`/` à la racine). */
export const ORG_SYNC_LAST_KEY_PREFIX = "hgdc-org-sync:"

/** Cadre caché qui ouvre la session d'un autre produit, seulement si elle manque (ADR 0026). */
export const SESSION_OPEN_PATH = "/auth/hgdc?frame=open"

/** Session du module ouvert, lue avant toute ouverture : la route better-auth sous sa base. */
export const SESSION_CHECK_PATH = "/api/auth/get-session"

/** Une ouverture au plus par produit pendant ce délai : une session vit 7 jours (`@hgdc/auth`). */
export const SESSION_OPEN_INTERVAL_MS: number = 24 * 60 * 60_000

/** Attente après l'affichage de la page avant la première ouverture : la page passe d'abord. */
export const SESSION_OPEN_DELAY_MS = 3000

/** Heure de la dernière ouverture d'un produit, en `localStorage` : `hgdc-session-open:<base>`. */
export const SESSION_OPEN_KEY_PREFIX = "hgdc-session-open:"

/**
 * Posée à la déconnexion d'un module (`AccountMenu`), levée à la prochaine connexion par clic
 * (`HgdcSignInButton` de `@hgdc/auth`) : tant qu'elle est là, rien ne s'ouvre en arrière-plan. Une
 * déconnexion (changer de compte, poste partagé) n'est jamais défaite sans la personne.
 */
export const SESSION_OPEN_PAUSED_KEY = "hgdc-session-open:paused"

/** Marque des cadres d'ouverture (`startSessionOpening`), retirés par `pauseSessionOpening`. */
const SESSION_OPEN_FRAME_ATTRIBUTE = "data-hgdc-session-open"

/**
 * À la déconnexion d'un module : plus d'ouverture en arrière-plan jusqu'à la prochaine connexion, et
 * les cadres d'ouverture en cours sont retirés (un cadre en vol reposerait la session d'un module
 * juste après la déconnexion).
 */
export function pauseSessionOpening(win: Window | null = typeof window === "undefined" ? null : window): void {
  try {
    win?.localStorage.setItem(SESSION_OPEN_PAUSED_KEY, String(Date.now()))
  } catch {
    // Stockage refusé : l'ouverture n'a pas lieu non plus sans lui (`startSessionOpening`).
  }
  for (const frame of win?.document.querySelectorAll(`iframe[${SESSION_OPEN_FRAME_ATTRIBUTE}]`) ?? []) frame.remove()
}

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
 * Vrai si la relecture de ce produit est due, et note alors l'heure : au plus une toutes les
 * `BACKGROUND_REFRESH_INTERVAL_MS`. Sans `localStorage` (navigation privée stricte), toujours due.
 */
function refreshDue(
  base: string,
  win: Window | null,
  now = Date.now(),
  prefix = ORG_SYNC_LAST_KEY_PREFIX,
  interval = BACKGROUND_REFRESH_INTERVAL_MS,
  withoutStorage = true,
): boolean {
  const key = `${prefix}${base || "/"}`
  try {
    const storage = win?.localStorage
    if (!storage) return withoutStorage
    const last = Number(storage.getItem(key))
    if (Number.isFinite(last) && last > 0 && now - last >= 0 && now - last < interval) return false
    storage.setItem(key, String(now))
  } catch {
    // Stockage refusé : la relecture part, comme avant ; l'ouverture, elle, ne part pas.
    return withoutStorage
  }
  return true
}

/**
 * Relit les organisations dans un cadre caché, une fois, si l'entrée l'a demandé et que la dernière
 * relecture de ce produit date de plus de `BACKGROUND_REFRESH_INTERVAL_MS`. Le cadre n'a ni script ni
 * formulaire (`sandbox`), il suit seulement les redirections d'Account ; la nouvelle session du
 * produit recopie les organisations, et les requêtes Convex abonnées se mettent à jour. Si la session
 * d'Account a expiré, Account refuse d'être affiché dans un cadre : rien ne se passe, la session du
 * produit reste celle d'avant. Une page prérendue au survol attend d'être affichée : un survol sans
 * clic ne relit rien.
 */
export function startBackgroundRefresh(doc: Document = document): HTMLIFrameElement | null {
  if ((doc as Document & { prerendering?: boolean }).prerendering) {
    doc.addEventListener("prerenderingchange", () => startBackgroundRefresh(doc), { once: true })
    return null
  }
  const base = takeOrgSync(doc)
  if (base === null || !refreshDue(base, doc.defaultView)) return null
  return openHiddenFrame(doc, `${base}${BACKGROUND_REFRESH_PATH}`)
}

/** Vrai si une déconnexion a suspendu l'ouverture, ou si le stockage manque (rien ne la limiterait). */
function openingPaused(win: Window | null): boolean {
  try {
    return !win?.localStorage || win.localStorage.getItem(SESSION_OPEN_PAUSED_KEY) !== null
  } catch {
    return true
  }
}

/**
 * Un cadre caché vers une adresse de l'entrée, retiré à son chargement ou après
 * `BACKGROUND_REFRESH_TIMEOUT_MS`. Ni script, ni formulaire, ni navigation de la page (`sandbox`) ;
 * même origine pour les cookies du produit. `onDone` est appelé une fois, quand il est retiré.
 */
function openHiddenFrame(doc: Document, src: string, onDone?: () => void): HTMLIFrameElement {
  const frame = doc.createElement("iframe")
  frame.hidden = true
  frame.tabIndex = -1
  frame.title = ""
  frame.setAttribute("aria-hidden", "true")
  frame.setAttribute("sandbox", "allow-same-origin")
  frame.referrerPolicy = "no-referrer"
  const done = () => {
    window.clearTimeout(timer)
    frame.remove()
    onDone?.()
  }
  const timer = window.setTimeout(done, BACKGROUND_REFRESH_TIMEOUT_MS)
  frame.addEventListener("load", done, { once: true })
  frame.src = src
  doc.body.append(frame)
  return frame
}

/**
 * La base d'un produit (`/mail`) depuis le lien relatif de sa barre (`/mail/auth/hgdc?…`), ou
 * `null` pour un lien absolu (autre origine) ou une base illisible.
 */
export function productEntryBase(href: string): string | null {
  if (!href.startsWith("/")) return null
  const index = href.indexOf("/auth/hgdc")
  if (index <= 0) return null
  const base = href.slice(0, index)
  return BASE_PATH.test(base) ? base : null
}

/**
 * Ouvre en arrière-plan la session des autres modules de la barre (ADR 0026) : un cadre caché à la
 * fois vers `<base>/auth/hgdc?frame=open`, au plus une fois par jour et par module, et seulement pour
 * un module sans session : sa session est lue d'abord (`SESSION_CHECK_PATH`, même origine). Déjà
 * ouverte : pas de cadre, la limite du jour est marquée. Lecture en échec : pas de cadre, la limite
 * n'est pas consommée. Sinon, la connexion HGDC se fait dans le cadre ; si ID demande quelque chose
 * (session expirée, consentement), il refuse d'être affiché dans un cadre et rien ne se passe : le
 * clic fera la connexion habituelle. Pas sur une page prérendue, ni quand l'économie de données est
 * demandée. Rend une fonction qui arrête la file.
 *
 * `current` : base du module ouvert. Donnée, rien ne part tant que ce module n'a pas de session : un
 * visiteur de la démo, sans compte, n'a pas de session d'ID à reprendre, et chaque cadre partirait
 * pour rien vers ID.
 */
export function startSessionOpening(
  bases: ReadonlyArray<string>,
  doc: Document = document,
  current?: string,
): () => void {
  const win = doc.defaultView
  const saveData = (win?.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection
    ?.saveData
  if (!win || saveData || (doc as Document & { prerendering?: boolean }).prerendering || openingPaused(win))
    return () => {}
  let stopped = false
  // Relu avant chaque étape et après chaque lecture : une déconnexion pendant la file l'arrête.
  const halted = () => stopped || openingPaused(win)
  void (async () => {
    if (current !== undefined && ((await readSession(win, current)) !== true || halted())) return
    for (const base of bases) {
      if (halted()) return
      // Sans stockage, pas de limite par jour : rien ne part (sinon une connexion par module à chaque page).
      if (!sessionOpenDue(win, base)) continue
      const open = await readSession(win, base)
      if (halted()) return
      // Lecture en échec : rien à décider, la limite reste libre pour la prochaine page.
      if (open === null) continue
      // Marque la limite ; faux si un autre onglet vient de le faire, ou si le stockage refuse.
      if (!refreshDue(base, win, Date.now(), SESSION_OPEN_KEY_PREFIX, SESSION_OPEN_INTERVAL_MS, false)) continue
      if (open) continue
      await new Promise<void>((resolve) => {
        openHiddenFrame(doc, `${base}${SESSION_OPEN_PATH}`, resolve).setAttribute(SESSION_OPEN_FRAME_ATTRIBUTE, "")
      })
    }
  })()
  return () => {
    stopped = true
  }
}

/** Vrai si la limite du jour de ce module est libre, sans la marquer. Stockage refusé : faux. */
function sessionOpenDue(win: Window, base: string): boolean {
  try {
    const last = Number(win.localStorage.getItem(`${SESSION_OPEN_KEY_PREFIX}${base || "/"}`))
    const age = Date.now() - last
    return !(Number.isFinite(last) && last > 0 && age >= 0 && age < SESSION_OPEN_INTERVAL_MS)
  } catch {
    return false
  }
}

/** Session du module de `base` : ouverte, absente, ou `null` si la lecture échoue. */
async function readSession(win: Window, base: string): Promise<boolean | null> {
  try {
    const response = await win.fetch(`${base}${SESSION_CHECK_PATH}`, { credentials: "include", cache: "no-store" })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (body === null) return false
    if (typeof body !== "object") return null
    return "session" in body && Boolean(body.session)
  } catch {
    return null
  }
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

/**
 * Dans la barre de Basalte (`ShellNavigation`) : ouvre la session des modules affichés servis sous
 * la même origine, `SESSION_OPEN_DELAY_MS` après l'affichage (ADR 0026). `bases` : clé stable
 * (les bases jointes), pour ne pas relancer la file à chaque rendu. `current` : base du module ouvert
 * (`startSessionOpening`) ; `null` (base inconnue) : rien ne part.
 */
export function useSessionOpening(bases: ReadonlyArray<string>, current?: string | null): void {
  const key = bases.join(" ")
  useEffect(() => {
    if (!key || current === null) return
    let stop = () => {}
    const timer = window.setTimeout(() => {
      stop = startSessionOpening(key.split(" "), document, current)
    }, SESSION_OPEN_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [key, current])
}
