/*
 * Chiffrement d'un secret stocké en base (clé Anthropic d'une organisation) :
 * AES-GCM 256, clé dérivée par HKDF-SHA-256 d'un secret du déploiement (`BETTER_AUTH_SECRET`) et
 * d'un usage, et données associées liées à l'organisation : une valeur copiée d'une organisation à
 * une autre ne s'ouvre pas, une fuite de la base seule ne révèle rien. `crypto.subtle` existe dans
 * les deux environnements Convex (V8 et Node).
 */

const encoder = new TextEncoder()
const VERSION = "v1"
const SALT = encoder.encode("hgdc-assistant-secret")

async function aesKey(secret: string, purpose: string): Promise<CryptoKey> {
  if (secret.length < 16) throw new Error("Secret de chiffrement absent ou trop court")
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(purpose) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

function toBase64(bytes: Uint8Array): string {
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

export type SecretOptions = {
  /** Secret du déploiement, jamais en base : `process.env.BETTER_AUTH_SECRET`. */
  secret: string
  /** À qui appartient le secret (l'organisation) : données associées, vérifiées à l'ouverture. */
  context: string
  /** Usage : une valeur scellée pour un usage ne s'ouvre pas pour un autre. */
  purpose?: string
}

/** `v1.<iv>.<chiffré>`, en une chaîne. */
export async function sealSecret(
  plain: string,
  { secret, context, purpose = "assistant-key" }: SecretOptions,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
      await aesKey(secret, purpose),
      encoder.encode(plain),
    ),
  )
  return `${VERSION}.${toBase64(iv)}.${toBase64(cipher)}`
}

/** Ouvre un secret scellé ; lève une erreur si le secret, l'usage ou l'organisation diffèrent. */
export async function openSecret(
  sealed: string,
  { secret, context, purpose = "assistant-key" }: SecretOptions,
): Promise<string> {
  const [version, iv, cipher] = sealed.split(".")
  if (version !== VERSION || !iv || !cipher) throw new Error("Secret scellé illisible")
  const key = await aesKey(secret, purpose)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(context) },
      key,
      fromBase64(cipher),
    )
    return new TextDecoder().decode(plain)
  } catch {
    // Secret du déploiement changé, autre usage, autre organisation ou valeur abîmée.
    throw new Error("Secret scellé illisible avec ce secret de déploiement")
  }
}

/** Les quatre derniers caractères, pour l'écran : la clé n'est plus jamais affichée. */
export function keyHint(key: string): string {
  return key.trim().slice(-4)
}
