/**
 * Adresse du visiteur à travers le proxy `/api/auth` d'un produit.
 *
 * Le front relaie `/api/auth/*` vers better-auth sur Convex. Vu de Convex, l'appel vient du serveur
 * du front, pas du visiteur : le reverse proxy devant Convex pose son adresse dans
 * `X-Forwarded-For`, la même pour tous les visiteurs, et la limite de débit par IP de better-auth
 * (3 connexions par 10 s sur `/sign-in`) devient commune à tout le monde.
 *
 * Le proxy signe donc l'adresse du visiteur (HMAC-SHA-256, secret partagé avec Convex, liée à la
 * méthode, au chemin et à l'instant, valable 60 s). Côté Convex, `restoreClientAddress` ne la croit
 * que si la signature est bonne et fraîche, et la pose alors dans `X-Forwarded-For`, l'en-tête que lit
 * better-auth. Sans signature valable, `X-Forwarded-For` n'est gardé que si le produit déclare un
 * reverse proxy de confiance qui l'écrase (`trustForwardedFor`) ; sinon (Convex Cloud, où le client
 * l'écrit lui-même) l'adresse devient la clé neutre `NEUTRAL_CLIENT_ADDRESS`, une limite commune. Un
 * visiteur ne peut rien imposer : sans le secret, son en-tête est retiré et ignoré.
 *
 * Un secret par produit (jamais partagé entre deux produits) : la signature ne couvre pas l'hôte, une
 * paire signée pour un produit ne doit rien valoir chez un autre.
 *
 * Seulement Web Crypto : le module tourne dans le runtime Convex comme sur Node.
 */

export const CLIENT_ADDRESS_HEADER = "x-hgdc-client-address"
export const CLIENT_ADDRESS_SIGNATURE_HEADER = "x-hgdc-client-address-signature"
const MAX_AGE_SECONDS = 60
const encoder = new TextEncoder()

/** Une adresse IPv4 ou IPv6 plausible (better-auth la revalide). */
function isAddress(value: string): boolean {
  return value.length <= 45 && /^[0-9a-f.:]+$/i.test(value) && /[.:]/.test(value)
}

/**
 * Adresse du visiteur vue par le front : `x-real-ip`, posé par l'hébergeur (l'edge de Host ou
 * Vercel, qui écrasent ce qu'envoie le client). Jamais `x-forwarded-for` : chez un hébergeur qui ne
 * l'écrase pas, le visiteur choisirait l'adresse signée. Sans `x-real-ip`, rien n'est signé.
 */
export function visitorAddress(headers: Headers): string | undefined {
  const candidate = headers.get("x-real-ip")?.trim()
  return candidate && isAddress(candidate) ? candidate : undefined
}

function scopeOf(method: string, url: URL): string {
  return `${method.toUpperCase()} ${url.pathname}${url.search}`
}

async function key(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage])
}

function message(address: string, scope: string, timestamp: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${address}\n${scope}\n${timestamp}`)
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

/**
 * Côté proxy : retire toute adresse signée reçue du client, puis signe `address` pour la requête
 * `method` vers `target` (URL de Convex). Sans secret ni adresse, rien n'est posé.
 */
export async function signClientAddress(
  headers: Headers,
  options: { address: string | undefined; method: string; target: URL; secret: string | undefined; now?: number },
): Promise<void> {
  headers.delete(CLIENT_ADDRESS_HEADER)
  headers.delete(CLIENT_ADDRESS_SIGNATURE_HEADER)
  const { address, secret } = options
  if (!secret || !address || !isAddress(address)) return
  const timestamp = String(Math.floor((options.now ?? Date.now()) / 1000))
  const mac = await crypto.subtle.sign(
    "HMAC",
    await key(secret, "sign"),
    message(address, scopeOf(options.method, options.target), timestamp),
  )
  headers.set(CLIENT_ADDRESS_HEADER, address)
  headers.set(CLIENT_ADDRESS_SIGNATURE_HEADER, `${timestamp}.${hex(mac)}`)
}

/**
 * En-tête où `restoreClientAddress` pose l'adresse retenue pour la limite de better-auth. Ce que le
 * client y écrit est toujours retiré. better-auth le lit seul avec `HGDC_IP_ADDRESS_OPTIONS`.
 */
export const RATE_LIMIT_ADDRESS_HEADER = "x-hgdc-rate-limit-address"

/**
 * Clé neutre : adresse retenue quand rien de fiable n'est connu (aucune signature valable et
 * `x-forwarded-for` non fiable). Tous ces appels partagent alors une seule limite, comme derrière un
 * seul front. Jamais l'adresse d'un vrai client : `0.0.0.0` n'ouvre aucune connexion.
 */
export const NEUTRAL_CLIENT_ADDRESS = "0.0.0.0"

/**
 * Réglage `advanced.ipAddress` de better-auth : il ne lit que l'en-tête posé par
 * `restoreClientAddress`, jamais `x-forwarded-for`. À utiliser avec `restoreClientAddress` sur toutes
 * les routes de better-auth, sinon la requête n'a pas d'adresse et better-auth ne limite rien.
 */
export const HGDC_IP_ADDRESS_OPTIONS: { ipAddressHeaders: string[] } = {
  ipAddressHeaders: [RATE_LIMIT_ADDRESS_HEADER],
}

export type RestoreClientAddressOptions = {
  /**
   * `true` seulement si un reverse proxy qu'on contrôle écrase `x-forwarded-for` avec l'adresse de
   * connexion avant Convex. Sinon (Convex Cloud, par exemple), cet en-tête est écrit par le client et
   * n'est jamais lu. Défaut : `false`.
   */
  trustForwardedFor?: boolean
  now?: number
}

/**
 * Adresse de connexion vue par le reverse proxy de confiance : la dernière de `x-forwarded-for`,
 * celle qu'il a écrite lui-même. `undefined` si l'en-tête manque ou n'est pas une adresse.
 */
function forwardedAddress(headers: Headers): string | undefined {
  const last = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
  return last && isAddress(last) ? last : undefined
}

/**
 * Adresse retenue pour la limite : signée et valable d'abord ; sinon celle du reverse proxy de
 * confiance ; sinon la clé neutre. Le `x-forwarded-for` d'un client n'est jamais retenu.
 */
export function rateLimitAddress(input: {
  signed: string | undefined
  forwardedFor: string | undefined
  trustForwardedFor: boolean
}): string {
  if (input.signed) return input.signed
  if (input.trustForwardedFor && input.forwardedFor) return input.forwardedFor
  return NEUTRAL_CLIENT_ADDRESS
}

async function verifiedAddress(request: Request, secret: string | undefined, now: number): Promise<string | undefined> {
  const address = request.headers.get(CLIENT_ADDRESS_HEADER)
  const signature = request.headers.get(CLIENT_ADDRESS_SIGNATURE_HEADER)
  if (!secret || !address || !signature || !isAddress(address)) return undefined
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(signature)
  if (!match || Math.abs(now / 1000 - Number(match[1])) > MAX_AGE_SECONDS) return undefined
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret, "verify"),
    fromHex(match[2]!),
    message(address, scopeOf(request.method, new URL(request.url)), match[1]!),
  )
  return valid ? address : undefined
}

/**
 * Côté Convex, avant better-auth, sur toutes ses routes. Retient une adresse (`rateLimitAddress`) et
 * la pose dans `x-forwarded-for`, `x-real-ip` et `RATE_LIMIT_ADDRESS_HEADER` : better-auth ne voit
 * jamais une adresse choisie par le client. Les en-têtes de signature sont toujours retirés.
 *
 * Le troisième argument accepte encore un instant (`now`, ancienne signature).
 */
export async function restoreClientAddress(
  request: Request,
  secret: string | undefined,
  options: number | RestoreClientAddressOptions = {},
): Promise<Request> {
  const { now = Date.now(), trustForwardedFor = false } = typeof options === "number" ? { now: options } : options
  const address = rateLimitAddress({
    signed: await verifiedAddress(request, secret, now),
    forwardedFor: forwardedAddress(request.headers),
    trustForwardedFor,
  })
  const headers = new Headers(request.headers)
  headers.delete(CLIENT_ADDRESS_HEADER)
  headers.delete(CLIENT_ADDRESS_SIGNATURE_HEADER)
  headers.set("x-forwarded-for", address)
  headers.set("x-real-ip", address)
  headers.set(RATE_LIMIT_ADDRESS_HEADER, address)
  return new Request(request, { headers })
}
