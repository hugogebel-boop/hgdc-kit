import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth"

import {
  HGDC_ENTRY_FRAME_PARAM,
  HGDC_ENTRY_NEXT_PARAM,
  HGDC_ENTRY_REFRESH_BACKGROUND,
  HGDC_ENTRY_REFRESH_PARAM,
  HGDC_FRAME_DONE_PATH,
  HGDC_ISSUER,
  HGDC_PROVIDER_ID,
  HGDC_ORG_SYNC_COOKIE,
  HGDC_ORG_SYNC_COOKIE_MAX_AGE,
  HGDC_SCOPES,
  hasSyncedMarker,
  normalizeBasePath,
  parseHgdcProfile,
  safeNextPath,
  withSyncedMarker,
  type BasePathOptions,
} from "./index.ts"
import { signClientAddress, visitorAddress } from "./client-address.ts"

export {
  CLIENT_ADDRESS_HEADER,
  CLIENT_ADDRESS_SIGNATURE_HEADER,
  HGDC_IP_ADDRESS_OPTIONS,
  NEUTRAL_CLIENT_ADDRESS,
  RATE_LIMIT_ADDRESS_HEADER,
  rateLimitAddress,
  restoreClientAddress,
  visitorAddress,
  type RestoreClientAddressOptions,
} from "./client-address.ts"

export { convexPath, createMcpProxy, MAX_MCP_BODY_BYTES, type McpProxyOptions } from "./mcp-proxy.ts"

/**
 * Vue demandée (ADR 0014 de la famille), posée et écrasée par la passerelle sur chaque relais :
 * `seul` pour `<mot>.hgdc.ch`, `app` pour `app.hgdc.ch/<mot>`. Elle choisit entre deux origines
 * constantes du produit, jamais une adresse. En direct sur l'origine relayée, un client peut la
 * choisir, mais ce nom n'a aucun cookie de session : il ne choisit que pour lui.
 */
export const VIEW_HEADER = "x-hgdc-view"

/** Vue d'une requête : `seul` seulement si `VIEW_HEADER` vaut exactement `seul`. */
export function requestView(request: Request): "app" | "seul" {
  return request.headers.get(VIEW_HEADER) === "seul" ? "seul" : "app"
}

/**
 * Retire de l'en-tête `Cookie` tout cookie `__Secure-__Host-…` (ADR 0014 de la famille). better-auth
 * lit certains cookies (jeton Convex du rendu serveur, `getSessionCookie`) d'abord sous le nom
 * `__Secure-<préfixe>.<nom>` : avec un préfixe `__Host-`, ce nom commence par `__Secure-` et un
 * nom voisin de `hgdc.ch` peut le poser pour tout le domaine. Aucun cookie légitime ne porte ce
 * nom. À appliquer à chaque requête, avant le handler de Start :
 *
 * ```ts
 * fetch: (request) => handler.fetch(withoutShadowCookies(request))
 * ```
 */
export function withoutShadowCookies(request: Request): Request {
  const header = request.headers.get("cookie")
  if (!header || !/__Secure-__Host-/i.test(header)) return request
  const kept = header
    .split(";")
    .filter((part) => !/^\s*__Secure-__Host-/i.test(part))
    .join(";")
    .trim()
  const headers = new Headers(request.headers)
  if (kept) headers.set("cookie", kept)
  else headers.delete("cookie")
  return new Request(request, { headers })
}

/** En-tête qui porte le `sec-fetch-mode` du navigateur à travers le proxy. */
export const FETCH_MODE_HEADER = "x-hgdc-fetch-mode"

const FETCH_MODES = new Set(["navigate", "cors", "no-cors", "same-origin", "websocket"])

/**
 * Côté Convex, avant better-auth : remet le `sec-fetch-mode` d'origine. better-auth y lit si
 * une réponse doit rediriger (navigation) ou rendre du JSON (`fetch`). Sans cela, toute
 * navigation vers `/oauth2/authorize` passée par le proxy reçoit du JSON au lieu d'un 302.
 * Sans risque : qui appelle Convex directement choisit déjà cet en-tête.
 */
export function restoreFetchMode(request: Request): Request {
  const mode = request.headers.get(FETCH_MODE_HEADER)
  if (!mode || !FETCH_MODES.has(mode)) return request
  const headers = new Headers(request.headers)
  headers.set("sec-fetch-mode", mode)
  headers.delete(FETCH_MODE_HEADER)
  return new Request(request, { headers })
}

/**
 * Proxy de `/api/auth/*` vers better-auth sur Convex (`https://<deploiement>.convex.site`),
 * à monter dans la route serveur d'un produit TanStack Start, avec `restoreFetchMode` côté Convex.
 *
 * Remplace le `handler` de @convex-dev/better-auth 0.12, qui a deux défauts :
 * - le corps part en flux : sur une réponse 401, undici échoue (« expected non-null body
 *   source ») et le client reçoit un 500 au lieu du refus. Ici il part en mémoire ;
 * - undici impose `sec-fetch-mode: cors` : le mode du navigateur voyage donc dans
 *   `x-hgdc-fetch-mode`.
 *
 * Produit servi sous un chemin (`options.basePath: "/analytics"`) : Convex sert better-auth à
 * `/api/auth/*`, sans base. Le préfixe est retiré avant le relais (`/analytics/api/auth/x` part vers
 * `/api/auth/x`), une seule fois, sur une frontière de segment. Un chemin sans la base (les appels
 * internes de `createHgdcEntry`) passe tel quel.
 *
 * Vue seule (`requestView`, ADR 0014) d'un produit servi sous un chemin, si `options.soloView` : la requête part vers la
 * seconde instance de better-auth, montée par Convex sous la base (`/analytics/api/auth/x`), dont
 * l'adresse de retour est sur `<mot>.hgdc.ch`. Un chemin sans la base y reçoit la base.
 *
 * `options.addressSecret` (secret partagé avec Convex) : l'adresse du visiteur part signée, et
 * `restoreClientAddress` la rend à better-auth côté Convex (`client-address.ts`). Absent : comme
 * avant, Convex ne voit que l'adresse du front, la même pour tous les visiteurs.
 */
export function createAuthProxy(
  convexSiteUrl: string,
  fetchImpl: typeof fetch = fetch,
  options: BasePathOptions & { addressSecret?: string; soloView?: boolean } = {},
): (request: Request) => Promise<Response> {
  const target = new URL(convexSiteUrl)
  const appBase = normalizeBasePath(options.basePath)
  const soloView = appBase !== "" && options.soloView === true
  return async (request) => {
    const url = new URL(request.url)
    // Chemin ambigu (segment vide, barre encodée) : jamais relayé, quelle que soit la lecture de Convex.
    if (/\/\/|%2f|%5c|\\/i.test(url.pathname)) return new Response(null, { status: 404 })
    const inApp = appBase && url.pathname.startsWith(`${appBase}/`) ? url.pathname.slice(appBase.length) : url.pathname
    const solo = soloView && requestView(request) === "seul"
    // Sous la base, Convex sert l'instance de la vue seule : la vue `app` n'y arrive jamais par une base doublée.
    if (appBase && !solo && inApp.startsWith(`${appBase}/`)) return new Response(null, { status: 404 })
    const upstreamPath = solo ? `${appBase}${inApp}` : inApp
    const headers = new Headers(request.headers)
    for (const name of ["transfer-encoding", "content-length", "connection"]) headers.delete(name)
    headers.set("accept-encoding", "application/json")
    headers.set("host", target.host)
    const proto = url.protocol.replace(/:$/, "")
    headers.set("x-forwarded-host", url.host)
    headers.set("x-forwarded-proto", proto)
    headers.set("x-better-auth-forwarded-host", url.host)
    headers.set("x-better-auth-forwarded-proto", proto)
    const mode = request.headers.get("sec-fetch-mode")
    if (mode) headers.set(FETCH_MODE_HEADER, mode)
    else headers.delete(FETCH_MODE_HEADER)
    const upstream = new URL(`${target.origin}${upstreamPath}${url.search}`)
    await signClientAddress(headers, {
      address: visitorAddress(request.headers),
      method: request.method,
      target: upstream,
      secret: options.addressSecret,
    })
    const hasBody = request.method !== "GET" && request.method !== "HEAD"
    return await fetchImpl(upstream.href, {
      method: request.method,
      headers,
      redirect: "manual",
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    })
  }
}

export type HgdcEntryOptions = {
  /** Le proxy `/api/auth` du produit (`createAuthProxy`). */
  proxy: (request: Request) => Promise<Response>
  /**
   * Page du produit si la connexion échoue (Account refuse, réseau) : sa page de connexion avec
   * son paramètre d'erreur, par exemple `/sign-in?error=1`. Chemin relatif du produit.
   */
  errorCallbackURL: string
  /** Chemin de better-auth, `/api/auth` par défaut. */
  basePath?: string
  /**
   * Base de chemin du produit servi sous un chemin (`/analytics`). `next` et `errorCallbackURL`
   * restent des chemins du produit, sans la base ; l'entrée les y remet avant de rediriger. Absent :
   * produit à la racine, comportement inchangé. À donner aussi à `createAuthProxy`.
   */
  appBasePath?: string
  /**
   * Origine publique du produit (`https://app.hgdc.ch`), envoyée comme `Origin` des appels internes
   * à better-auth. Derrière un relais, l'hôte vu par la fonction est l'origine relayée
   * (`analytics.hgdc.cloud`), absente des `trustedOrigins` : sans elle, better-auth refuse la
   * connexion dès qu'un cookie est présent. Absent : l'origine de la requête.
   */
  appOrigin?: string
  /**
   * Origine publique de la vue seule (`https://analytics.hgdc.ch`, ADR 0014), prise à la place
   * d'`appOrigin` quand la requête vient de `<mot>.hgdc.ch` (`requestView`). Absent : pas de vue seule.
   */
  soloOrigin?: string
}

const STRIPPED_ON_INTERNAL_CALL = [
  "content-length",
  "content-type",
  "accept",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-site",
  "sec-fetch-user",
  FETCH_MODE_HEADER,
]

function internalHeaders(request: Request, origin: string): Headers {
  // Garde cookies, adresse IP et user-agent (limites de débit, sessions) ; retire le mode de
  // navigation, sinon better-auth rendrait une redirection au lieu du JSON attendu.
  const headers = new Headers(request.headers)
  for (const name of STRIPPED_ON_INTERNAL_CALL) headers.delete(name)
  headers.set("accept", "application/json")
  headers.set("origin", origin)
  return headers
}

function setCookies(response: Response): string[] {
  return typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []
}

function redirectTo(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" })
  for (const cookie of cookies) headers.append("set-cookie", cookie)
  return new Response(null, { status: 302, headers })
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function hasSessionBody(body: unknown): boolean {
  return typeof body === "object" && body !== null && "session" in body && Boolean(body.session)
}

function authorizationUrl(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("url" in body) || typeof body.url !== "string") return null
  try {
    const url = new URL(body.url)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Entrée commune `GET /auth/hgdc?next=<chemin>` (`HGDC_ENTRY_PATH`), à monter comme route
 * serveur du produit. Le menu « Produits » de `@hgdc/ui` y envoie : on entre dans le produit
 * sans passer par sa page d'accueil ni recliquer « Se connecter avec HGDC ».
 *
 * - Session du produit ouverte : redirection vers `next`.
 * - Sinon : la connexion HGDC part aussitôt (même appel que `HgdcSignInButton`, fait par le
 *   serveur), retour vers `next`. Si la session d'Account est ouverte et le produit déjà
 *   autorisé, Account renvoie sans formulaire : trois redirections, aucun clic.
 * - `refresh=1` (`HGDC_ENTRY_REFRESH_PARAM`) : la connexion HGDC part même si la session du
 *   produit est ouverte. La nouvelle session relit le claim `organizations` (crochet
 *   `session.create.before`) ; retour vers `next?synced=1` (`HGDC_SYNCED_PARAM`), pour que la
 *   page ne relance pas l'entrée. Un `next` qui porte déjà `synced=1` ne relance rien : pas de
 *   boucle. L'ancienne session n'est pas révoquée : si Account ne répond pas, la personne garde
 *   son accès, et la session expire seule (`SESSION_TTL_SECONDS`).
 * - `refresh=background` (barre des produits, ADR 0016) : session du produit ouverte, droit à
 *   `next` avec le cookie `HGDC_ORG_SYNC_COOKIE` ; la page d'arrivée relit les organisations dans
 *   un cadre caché (`frame=1`, retour sur `HGDC_FRAME_DONE_PATH`). Sans session, comme sans
 *   paramètre.
 * - Préchargement (`Sec-Purpose: prefetch`) : seule la redirection d'une session ouverte est
 *   rendue ; tout ce qui démarrerait une connexion répond 503, que le navigateur jette.
 *
 * `next` est filtré par `safeNextPath` (chemin du produit seulement, pas de redirection ouverte),
 * puis better-auth le revérifie contre ses `trustedOrigins`.
 *
 * ```ts
 * // src/routes/auth/hgdc.ts
 * const entry = createHgdcEntry({ proxy: proxyAuth, errorCallbackURL: "/sign-in?error=1" })
 * export const Route = createFileRoute("/auth/hgdc")({
 *   server: { handlers: { GET: ({ request }) => entry(request) } },
 * })
 * ```
 */
export function createHgdcEntry(options: HgdcEntryOptions): (request: Request) => Promise<Response> {
  const appBase = normalizeBasePath(options.appBasePath)
  const appPath = { basePath: appBase }
  const errorPath = safeNextPath(options.errorCallbackURL, "", appPath)
  const errorCallbackURL = errorPath && `${appBase}${errorPath}`
  if (!errorCallbackURL) throw new Error("createHgdcEntry : errorCallbackURL doit être un chemin du produit.")
  const basePath = (options.basePath ?? "/api/auth").replace(/\/+$/, "")
  const appOrigin = options.appOrigin ? new URL(options.appOrigin).origin : null
  const soloOrigin = options.soloOrigin ? new URL(options.soloOrigin).origin : null
  if (soloOrigin && !appBase)
    throw new Error("createHgdcEntry : soloOrigin demande appBasePath (build sous un chemin).")

  return async (request) => {
    const url = new URL(request.url)
    // Sans soloOrigin, l'en-tête de vue est ignoré : même règle que `soloView` du proxy.
    const view = soloOrigin ? requestView(request) : "app"
    const origin = (view === "seul" ? soloOrigin : null) ?? appOrigin ?? url.origin
    const frame = url.searchParams.get(HGDC_ENTRY_FRAME_PARAM)
    // Fin d'une relecture dans le cadre caché : rien à lire, rien à appeler.
    if (frame === "done") return frameDone()
    const inFrame = frame === "1"
    const speculative = isSpeculative(request)
    const next = safeNextPath(url.searchParams.get(HGDC_ENTRY_NEXT_PARAM), "/", appPath)
    const refreshParam = url.searchParams.get(HGDC_ENTRY_REFRESH_PARAM)
    // Un `next` déjà marqué revient d'une resynchronisation : on n'en relance pas une autre.
    const refresh = inFrame || (refreshParam === "1" && !hasSyncedMarker(next))
    const background = !refresh && refreshParam === HGDC_ENTRY_REFRESH_BACKGROUND
    // Le cadre revient toujours sur la réponse vide, jamais sur une page reçue en paramètre.
    const callbackURL = `${appBase}${inFrame ? HGDC_FRAME_DONE_PATH : refresh ? withSyncedMarker(next) : next}`
    const errorURL = inFrame ? `${appBase}${HGDC_FRAME_DONE_PATH}` : errorCallbackURL
    // Un préchargement ne démarre jamais de connexion : état OAuth, code d'Account et session
    // créés pour un survol sans clic. Il ne sert que si la session du produit est déjà ouverte.
    if (refresh && speculative) return notForSpeculation()
    const cookies: string[] = []
    try {
      if (!refresh && request.headers.has("cookie")) {
        // Session vérifiée par better-auth (base du produit), pas seulement la présence du cookie.
        const session = await options.proxy(
          new Request(`${url.origin}${basePath}/get-session`, { headers: internalHeaders(request, origin) }),
        )
        cookies.push(...setCookies(session))
        if (session.ok && hasSessionBody(await readJson(session)))
          return redirectTo(`${appBase}${next}`, background ? [...cookies, orgSyncCookie(url, appBase, view)] : cookies)
      }
      if (speculative) return notForSpeculation()

      const headers = internalHeaders(request, origin)
      headers.set("content-type", "application/json")
      const signIn = await options.proxy(
        new Request(`${url.origin}${basePath}/sign-in/oauth2`, {
          method: "POST",
          headers,
          body: JSON.stringify({ providerId: HGDC_PROVIDER_ID, callbackURL, errorCallbackURL: errorURL }),
        }),
      )
      const target = signIn.ok ? authorizationUrl(await readJson(signIn)) : null
      if (!target) return redirectTo(errorURL, cookies)
      return redirectTo(target, [...cookies, ...setCookies(signIn)])
    } catch {
      return speculative ? notForSpeculation() : redirectTo(errorURL, cookies)
    }
  }
}

/** Préchargement ou prérendu (Speculation Rules) : `Sec-Purpose: prefetch`, `prefetch;prerender`. */
function isSpeculative(request: Request): boolean {
  const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? ""
  return /\b(prefetch|prerender)\b/i.test(purpose)
}

/** Refus d'un préchargement : le navigateur jette une réponse qui n'est pas 2xx, le clic repart. */
function notForSpeculation(): Response {
  return new Response(null, { status: 503, headers: { "cache-control": "no-store", "retry-after": "0" } })
}

function frameDone(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  })
}

/**
 * Limité au chemin du produit (`/analytics`) et portant ce chemin : sous une origine partagée
 * (`app.hgdc.ch/<produit>`), seul le produit d’arrivée le voit, et sa page sait où ouvrir le cadre.
 * En vue seule (`<mot>.hgdc.ch`, ADR 0014), l’origine n’est qu’au produit et l’adresse affichée n’a
 * plus la base : `Path=/`.
 */
function orgSyncCookie(url: URL, appBase: string, view: "app" | "seul"): string {
  const secure = url.protocol === "https:" ? "; Secure" : ""
  const value = appBase || "1"
  return `${HGDC_ORG_SYNC_COOKIE}=${value}; Path=${view === "seul" ? "/" : appBase || "/"}; Max-Age=${HGDC_ORG_SYNC_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

export type HgdcProviderOptions = {
  /** Identifiant du client, remis par HGDC à l'enregistrement du produit. */
  clientId: string
  /** Secret du client : variable d'environnement côté serveur, jamais dans le navigateur. */
  clientSecret: string
  /** Émetteur, à changer seulement pour un Account de préproduction. */
  issuer?: string
  /** Portées demandées, `HGDC_SCOPES` par défaut. */
  scopes?: readonly string[]
}

/**
 * Configuration du fournisseur « HGDC » pour le plugin `genericOAuth` de better-auth :
 * découverte OIDC, code d'autorisation avec PKCE, émetteur vérifié contre la confusion
 * entre fournisseurs. Le profil reçu est validé avant de créer ou relier un compte.
 *
 * ```ts
 * genericOAuth({ config: [hgdcProvider({ clientId, clientSecret })] })
 * ```
 */
export function hgdcProvider(options: HgdcProviderOptions): GenericOAuthConfig {
  if (!options.clientId || !options.clientSecret) {
    throw new Error("HGDC Account : clientId et clientSecret sont requis (voir le runbook d'Account).")
  }
  const issuer = (options.issuer ?? HGDC_ISSUER).replace(/\/+$/, "")
  return {
    providerId: HGDC_PROVIDER_ID,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    issuer,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    requireIssuerValidation: true,
    scopes: [...(options.scopes ?? HGDC_SCOPES)],
    pkce: true,
    // L'identifiant du compte reste `sub` (lu par better-auth) ; ici seulement l'utilisateur.
    mapProfileToUser: (claims) => {
      const profile = parseHgdcProfile(claims)
      return {
        email: profile.email,
        emailVerified: profile.email_verified,
        name: profile.name,
        image: profile.picture ?? null,
      }
    },
  }
}
