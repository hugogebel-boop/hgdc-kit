import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth"

import {
  HGDC_ENTRY_NEXT_PARAM,
  HGDC_ISSUER,
  HGDC_PROVIDER_ID,
  HGDC_SCOPES,
  parseHgdcProfile,
  safeNextPath,
} from "./index.ts"

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
 */
export function createAuthProxy(
  convexSiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): (request: Request) => Promise<Response> {
  const target = new URL(convexSiteUrl)
  return async (request) => {
    const url = new URL(request.url)
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
    const hasBody = request.method !== "GET" && request.method !== "HEAD"
    return await fetchImpl(`${target.origin}${url.pathname}${url.search}`, {
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
 * sans passer par sa page d'accueil ni recliquer « Se connecter avec H family ».
 *
 * - Session du produit ouverte : redirection vers `next`.
 * - Sinon : la connexion HGDC part aussitôt (même appel que `HgdcSignInButton`, fait par le
 *   serveur), retour vers `next`. Si la session d'Account est ouverte et le produit déjà
 *   autorisé, Account renvoie sans formulaire : trois redirections, aucun clic.
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
  const errorCallbackURL = safeNextPath(options.errorCallbackURL, "")
  if (!errorCallbackURL) throw new Error("createHgdcEntry : errorCallbackURL doit être un chemin du produit.")
  const basePath = (options.basePath ?? "/api/auth").replace(/\/+$/, "")

  return async (request) => {
    const url = new URL(request.url)
    const next = safeNextPath(url.searchParams.get(HGDC_ENTRY_NEXT_PARAM))
    const cookies: string[] = []
    try {
      if (request.headers.has("cookie")) {
        const session = await options.proxy(
          new Request(`${url.origin}${basePath}/get-session`, { headers: internalHeaders(request, url.origin) }),
        )
        cookies.push(...setCookies(session))
        if (session.ok && hasSessionBody(await readJson(session))) return redirectTo(next, cookies)
      }

      const headers = internalHeaders(request, url.origin)
      headers.set("content-type", "application/json")
      const signIn = await options.proxy(
        new Request(`${url.origin}${basePath}/sign-in/oauth2`, {
          method: "POST",
          headers,
          body: JSON.stringify({ providerId: HGDC_PROVIDER_ID, callbackURL: next, errorCallbackURL }),
        }),
      )
      const target = signIn.ok ? authorizationUrl(await readJson(signIn)) : null
      if (!target) return redirectTo(errorCallbackURL, cookies)
      return redirectTo(target, [...cookies, ...setCookies(signIn)])
    } catch {
      return redirectTo(errorCallbackURL, cookies)
    }
  }
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
