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
 * better-auth. Sinon la requête garde l'adresse posée par le reverse proxy, comme sans proxy. Un
 * visiteur ne peut rien imposer : sans le secret, son en-tête est retiré et ignoré.
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
 * Vercel, qui écrasent ce qu'envoie le client), sinon la première entrée de `x-forwarded-for`.
 */
export function visitorAddress(headers: Headers): string | undefined {
  const candidate = headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
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
 * Côté Convex, avant better-auth : une adresse signée par le proxy, bonne et fraîche, remplace
 * `x-forwarded-for` et `x-real-ip`. Les en-têtes de signature sont toujours retirés. Sans secret,
 * ou avec une signature absente, fausse ou périmée, les en-têtes d'adresse restent ceux du reverse
 * proxy. Sans en-tête de signature, la requête est rendue telle quelle.
 */
export async function restoreClientAddress(
  request: Request,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<Request> {
  const address = request.headers.get(CLIENT_ADDRESS_HEADER)
  const signature = request.headers.get(CLIENT_ADDRESS_SIGNATURE_HEADER)
  if (address === null && signature === null) return request
  const headers = new Headers(request.headers)
  headers.delete(CLIENT_ADDRESS_HEADER)
  headers.delete(CLIENT_ADDRESS_SIGNATURE_HEADER)
  if (secret && address && signature && isAddress(address)) {
    const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(signature)
    if (match && Math.abs(now / 1000 - Number(match[1])) <= MAX_AGE_SECONDS) {
      const valid = await crypto.subtle.verify(
        "HMAC",
        await key(secret, "verify"),
        fromHex(match[2]!),
        message(address, scopeOf(request.method, new URL(request.url)), match[1]!),
      )
      if (valid) {
        headers.set("x-forwarded-for", address)
        headers.set("x-real-ip", address)
      }
    }
  }
  return new Request(request, { headers })
}
