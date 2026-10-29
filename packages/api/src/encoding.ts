/*
 * Encodages internes au paquet : base62, hexadécimal, base64url, CRC-32. Web Crypto et fonctions
 * pures seulement, pour tourner dans le runtime V8 de Convex (sans Node).
 */

export const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/** Plus grand multiple de 62 qui tient dans un octet : un octet au-delà est rejeté, sinon biais. */
const REJECT_FROM = 256 - (256 % 62) // 248

/**
 * `length` caractères base62 tirés par rejet : un octet ≥ 248 est jeté et retiré, chaque caractère
 * a donc exactement la même probabilité (1/62). `random` sert aux tests ; par défaut Web Crypto.
 */
export function randomBase62(
  length: number,
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  let out = ""
  while (out.length < length) {
    // Le rejet perd 3 % des octets en moyenne : un lot un peu plus grand évite les tours en trop.
    // `getRandomValues` refuse plus de 65 536 octets d'un coup.
    const batch = random(new Uint8Array(Math.min(65_536, Math.ceil((length - out.length) * 1.1) + 4)))
    for (const byte of batch) {
      if (byte >= REJECT_FROM) continue
      out += BASE62[byte % 62]
      if (out.length === length) break
    }
  }
  return out
}

/** Entier positif en base62, complété à gauche par des `0` jusqu'à `width` caractères. */
export function toBase62(value: number, width: number): string {
  let n = Math.floor(value)
  let out = ""
  do {
    out = BASE62[n % 62] + out
    n = Math.floor(n / 62)
  } while (n > 0)
  return out.padStart(width, "0")
}

let crcTable: Uint32Array | undefined

/** CRC-32 (IEEE 802.3) d'une chaîne UTF-8 : somme de contrôle, pas une garantie cryptographique. */
export function crc32(text: string): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[i] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of new TextEncoder().encode(text)) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** SHA-256 en hexadécimal, par Web Crypto. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
}

export function toBase64Url(text: string): string {
  let binary = ""
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** `null` pour une entrée qui n'est pas du base64url valide ou pas de l'UTF-8 valide. */
export function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
