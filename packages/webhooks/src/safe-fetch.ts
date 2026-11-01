/*
 * Requête HTTP sortante vers une adresse donnée par un client (webhook, import d'un site), sans
 * SSRF ni rebinding DNS. Node seulement (`node:https`, `node:dns`) : dans Convex, une action
 * `"use node"`. Le runtime par défaut de Convex n'a que `fetch`, qui résout le nom lui-même :
 * impossible d'y imposer l'adresse vérifiée (voir `resolvesPublicly`).
 *
 * Pour chaque saut (redirections comprises) :
 * 1. l'URL passe `isPublicUrl` (http(s), port standard, nom public, sans identifiants) ;
 * 2. le nom est résolu une fois ; une seule adresse privée, de boucle locale, link-local, de
 *    métadonnées ou IPv6 ULA, et tout est refusé ;
 * 3. la connexion vise l'adresse vérifiée (option `lookup` de `node:https`) : `Host` et SNI
 *    gardent le nom d'origine, aucune seconde résolution ne peut changer la cible.
 * Délai et taille de la réponse bornés.
 */
import { lookup as dnsLookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import type { IncomingHttpHeaders, RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"
import type { LookupFunction } from "node:net"

import { isPrivateIp, isPublicUrl } from "./ssrf.js"

export type SafeFetchErrorCode =
  | "unsafe_url"
  | "private_address"
  | "dns"
  | "timeout"
  | "too_large"
  | "too_many_redirects"
  | "network"

/** Refus ou échec, avec un code stable et un message lisible (français), sans le corps reçu. */
export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode
  constructor(code: SafeFetchErrorCode, message: string) {
    super(message)
    this.name = "SafeFetchError"
    this.code = code
  }
}

export type SafeFetchOptions = {
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  /** Délai total, redirections comprises. 10 s par défaut. */
  timeoutMs?: number
  /** Taille maximale du corps reçu, en octets. 1 Mo par défaut. */
  maxBytes?: number
  /** Redirections suivies, chacune revérifiée. 0 par défaut : une 3xx est rendue telle quelle. */
  maxRedirects?: number
  /** Refuser `http:`. */
  httpsOnly?: boolean
}

export type SafeResponse = {
  status: number
  headers: IncomingHttpHeaders
  body: Uint8Array
  /** L'URL du dernier saut. */
  url: string
}

/** Toutes les adresses d'un nom (A et AAAA), dans l'ordre du résolveur. */
export type Resolve = (host: string) => Promise<{ address: string; family: 4 | 6 }[]>

/** Un saut, vers une adresse déjà vérifiée. Remplaçable dans les tests. */
export type Send = (
  url: URL,
  target: { address: string; family: 4 | 6 },
  init: {
    method: string
    headers: Record<string, string>
    body?: string | Uint8Array
    maxBytes: number
    signal: AbortSignal
  },
) => Promise<{ status: number; headers: IncomingHttpHeaders; body: Uint8Array }>

const systemResolve: Resolve = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((a) => ({
    address: a.address,
    family: a.family === 6 ? 6 : 4,
  }))

/** La seule adresse que `node:net` aura le droit d'utiliser : le nom n'est plus résolu. */
export function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family }])
    else callback(null, address, family)
  }
}

/** Connexion à l'adresse vérifiée, `Host` et SNI sur le nom d'origine. */
export const sendPinned: Send = (url, target, init) =>
  new Promise((resolve, reject) => {
    const options: RequestOptions & { servername?: string } = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: init.method,
      headers: { ...init.headers, host: url.host },
      lookup: pinnedLookup(target.address, target.family),
      signal: init.signal,
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    }
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(options, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > init.maxBytes) {
          res.destroy()
          reject(new SafeFetchError("too_large", `Réponse de plus de ${init.maxBytes} octets.`))
          return
        }
        chunks.push(chunk)
      })
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on("error", reject)
    })
    req.on("error", reject)
    if (init.body !== undefined) req.write(init.body)
    req.end()
  })

/** Le nom ne mène-t-il qu'à des adresses publiques ? La première, sinon une erreur. */
async function checkedTarget(url: URL, resolve: Resolve) {
  let addresses: Awaited<ReturnType<Resolve>>
  try {
    addresses = await resolve(url.hostname.replace(/\.+$/, ""))
  } catch {
    throw new SafeFetchError("dns", `Le nom ${url.hostname} ne se résout pas.`)
  }
  if (addresses.length === 0) throw new SafeFetchError("dns", `Le nom ${url.hostname} ne se résout pas.`)
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new SafeFetchError("private_address", "L'adresse mène à un réseau privé ou interne.")
  }
  return addresses[0]!
}

/**
 * Requête vers une URL fournie par un client. Lève `SafeFetchError` sur un refus ou un échec ;
 * une réponse HTTP d'erreur (4xx, 5xx) est rendue, pas levée.
 */
export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {},
  deps: { resolve?: Resolve; send?: Send } = {},
): Promise<SafeResponse> {
  const { timeoutMs = 10_000, maxBytes = 1_000_000, maxRedirects = 0, httpsOnly = false } = options
  const resolve = deps.resolve ?? systemResolve
  const send = deps.send ?? sendPinned
  const signal = AbortSignal.timeout(timeoutMs)
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new SafeFetchError("unsafe_url", "Cette adresse n'a pas la forme d'une URL.")
  }
  let method = (options.method ?? "GET").toUpperCase()
  let body = options.body
  for (let hop = 0; ; hop++) {
    if (!isPublicUrl(url, { httpsOnly })) {
      throw new SafeFetchError("unsafe_url", "L'adresse doit viser un site public, sans IP ni port particulier.")
    }
    const target = await checkedTarget(url, resolve)
    let response: Awaited<ReturnType<Send>>
    try {
      response = await send(url, target, {
        method,
        headers: options.headers ?? {},
        ...(body !== undefined ? { body } : {}),
        maxBytes,
        signal,
      })
    } catch (e) {
      if (e instanceof SafeFetchError) throw e
      if (signal.aborted) throw new SafeFetchError("timeout", `Pas de réponse en ${timeoutMs} ms.`)
      throw new SafeFetchError("network", "La connexion a échoué.")
    }
    const location = response.headers.location
    if (response.status < 300 || response.status >= 400 || !location || maxRedirects === 0) {
      return { ...response, url: url.toString() }
    }
    if (hop >= maxRedirects) throw new SafeFetchError("too_many_redirects", "Trop de redirections.")
    try {
      url = new URL(location, url)
    } catch {
      throw new SafeFetchError("unsafe_url", "Redirection vers une adresse illisible.")
    }
    // 303, et 301 ou 302 après un POST (comme les navigateurs) : la suite se lit en GET, sans corps.
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET"
      body = undefined
    }
  }
}
