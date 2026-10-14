import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth"

import { HGDC_ISSUER, HGDC_PROVIDER_ID, HGDC_SCOPES, parseHgdcProfile } from "./index.ts"

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
