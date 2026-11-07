/**
 * Fichier image envoyé ou téléchargé, lu dans ses octets et sans I/O : le type annoncé ne prouve rien.
 * Un SVG n'y figure jamais : ouvert seul, il exécuterait ses scripts sur l'origine qui le sert.
 */

/** Type réel d'une image, d'après ses premiers octets ; `null` si ce n'est ni PNG, ni JPEG, ni WebP. */
export function imageKind(head: Uint8Array): "png" | "jpeg" | "webp" | null {
  const at = (i: number) => head[i] ?? -1
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return "png"
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg"
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp"
  return null
}

export type ImageKind = NonNullable<ReturnType<typeof imageKind>>

export const IMAGE_MIME: Record<ImageKind, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }

/** Dimensions d'un PNG, lues dans son en-tête `IHDR` ; `null` si l'en-tête manque. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Dimensions d'un JPEG, lues dans son premier segment SOF ; `null` si aucun n'est trouvé. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1] ?? 0
    if (marker === 0xff) {
      i++
      continue
    }
    // Marqueurs sans longueur : début d'image, redémarrages.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (sof)
      return {
        height: ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0),
        width: ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0),
      }
    i += 2 + (((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))
  }
  return null
}

/** Dimensions d'un WebP (VP8, VP8L ou VP8X) ; `null` si l'en-tête manque. */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null
  const b = (i: number) => bytes[i] ?? 0
  const chunk = String.fromCharCode(...bytes.slice(12, 16))
  if (chunk === "VP8 ") return { width: (b(26) | (b(27) << 8)) & 0x3fff, height: (b(28) | (b(29) << 8)) & 0x3fff }
  if (chunk === "VP8L")
    return {
      width: 1 + (((b(22) & 0x3f) << 8) | b(21)),
      height: 1 + (((b(24) & 0x0f) << 10) | (b(23) << 2) | ((b(22) & 0xc0) >> 6)),
    }
  if (chunk === "VP8X")
    return { width: 1 + (b(24) | (b(25) << 8) | (b(26) << 16)), height: 1 + (b(27) | (b(28) << 8) | (b(29) << 16)) }
  return null
}

/** Côté le plus long accepté pour une image téléversée : au-delà, rien ne sert et le décodage coûte. */
export const MAX_IMAGE_SIDE = 4096

export function imageSize(kind: ImageKind, bytes: Uint8Array): { width: number; height: number } | null {
  return kind === "png" ? pngSize(bytes) : kind === "jpeg" ? jpegSize(bytes) : webpSize(bytes)
}

/** Segments JPEG gardés : JFIF (APP0), profil de couleur (APP2), Adobe (APP14, conversion des couleurs). */
const KEPT_APP = new Set([0xe0, 0xe2, 0xee])

/**
 * JPEG sans ses métadonnées : EXIF et XMP (APP1, dont la position GPS), IPTC (APP13), commentaires
 * et autres segments d'application sont retirés, l'image elle-même n'est pas touchée (pas de
 * réencodage). Un fichier mal formé est rendu tel quel : `imageProblem` l'a déjà contrôlé.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const parts: Uint8Array[] = [bytes.slice(0, 2)]
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes
    const marker = bytes[i + 1] ?? 0
    // Début des données compressées : tout le reste est l'image.
    if (marker === 0xda) {
      parts.push(bytes.slice(i))
      break
    }
    const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)
    const end = i + 2 + length
    if (length < 2 || end > bytes.length) return bytes
    const metadata = (marker >= 0xe1 && marker <= 0xef && !KEPT_APP.has(marker)) || marker === 0xfe
    if (!metadata) parts.push(bytes.slice(i, end))
    i = end
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
