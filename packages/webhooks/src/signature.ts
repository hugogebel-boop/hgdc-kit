/*
 * Signature et vérification au format Standard Webhooks (https://www.standardwebhooks.com/) :
 * en-têtes `webhook-id`, `webhook-timestamp` (secondes) et `webhook-signature` (`v1,<base64>`,
 * plusieurs séparées par une espace). La signature est le HMAC-SHA256 de
 * `<id>.<timestamp>.<corps brut>` avec la clé décodée de la partie base64 du secret `whsec_…`.
 * Web Crypto seulement : Convex, navigateur, Bun et Node.
 */

/** Écart toléré entre l'horodatage d'un message et l'heure du récepteur : au-delà, c'est un rejeu. */
export const TOLERANCE_SECONDS = 300

/** Forme d'un secret `whsec_<base64>` (au moins 15 octets, 64 au plus selon la spécification). */
export const SECRET_PATTERN: RegExp = /^whsec_[A-Za-z0-9+/]{20,100}={0,2}$/

const SECRET_PREFIX = "whsec_"

function toBase64(bytes: Uint8Array): string {
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const text = atob(value)
    const out = new Uint8Array(new ArrayBuffer(text.length))
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** `whsec_` suivi de 32 octets aléatoires en base64. À tirer dans un contexte où le hasard est secret (action, pas mutation Convex). */
export function generateSecret(): string {
  return `${SECRET_PREFIX}${toBase64(crypto.getRandomValues(new Uint8Array(32)))}`
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey | null> {
  const raw = fromBase64(secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret)
  if (!raw || raw.length === 0) return null
  return await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [usage])
}

/** Signature `v1,<base64>` d'un message. `timestamp` en secondes. Lève si le secret est illisible. */
export async function sign(secret: string, id: string, timestamp: number, body: string): Promise<string> {
  const key = await hmacKey(secret, "sign")
  if (!key) throw new Error("Secret de webhook illisible.")
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  return `v1,${toBase64(new Uint8Array(mac))}`
}

/** Les en-têtes d'une requête de livraison, corps JSON compris. */
export async function signedHeaders(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): Promise<Record<"content-type" | "webhook-id" | "webhook-timestamp" | "webhook-signature", string>> {
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": await sign(secret, id, timestamp, body),
  }
}

export type Verdict = "ok" | "invalid" | "expired"

/**
 * Vérifie un message reçu. `invalid` : en-tête absent, signature fausse ou secret illisible ;
 * `expired` : horodatage à plus de `toleranceSeconds` de `now`. Comparaison en temps constant
 * (`crypto.subtle.verify`). `body` est le corps **brut**, avant tout `JSON.parse`.
 */
export async function verify(input: {
  secret: string
  id: string | null | undefined
  timestamp: string | null | undefined
  signature: string | null | undefined
  body: string
  /** Heure du récepteur en ms. */
  now?: number
  toleranceSeconds?: number
}): Promise<Verdict> {
  const { secret, id, timestamp, signature, body, now = Date.now(), toleranceSeconds = TOLERANCE_SECONDS } = input
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return "invalid"
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return "expired"
  const key = await hmacKey(secret, "verify")
  if (!key) return "invalid"
  const data = new TextEncoder().encode(`${id}.${timestamp}.${body}`)
  for (const candidate of signature.split(" ")) {
    const [version, value] = candidate.split(",")
    if (version !== "v1" || !value) continue
    const bytes = fromBase64(value)
    if (bytes && (await crypto.subtle.verify("HMAC", key, bytes, data))) return "ok"
  }
  return "invalid"
}
