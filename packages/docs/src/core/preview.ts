/**
 * Contrat de l'aperçu (ADR 0011), partagé par le site (pont), la passerelle d'aperçu,
 * Convex et la console : messages entre la console et l'aperçu, jetons d'accès, limites.
 * Pur : WebCrypto seulement (navigateur, Node, Convex).
 */

/** Clé des messages `postMessage` entre la console et l'aperçu. */
export const PREVIEW_MESSAGE = "hgdc-docs-preview"

/** Identifiant de session : une étiquette DNS (`<id>.preview.hgdc.cloud`). */
export const SESSION_ID = /^[a-z0-9]{20,40}$/
/** Génération d'un emplacement : change à chaque nouveau locataire. */
export const GENERATION = /^[a-z0-9]{16,40}$/
const NONCE = /^[a-z0-9]{8,40}$/
const TOKEN_SHAPE = /^[a-z0-9]{20,40}\.[a-z0-9]{16,40}\.\d{1,15}\.[a-z0-9]{8,40}\.[A-Za-z0-9_-]{43}$/

/** Console → aperçu : thème, et jeton frais pour renouveler le cookie sans recharger. */
export type PreviewCommand = { type: "theme"; theme: "light" | "dark" } | { type: "renew"; token: string }
/** Aperçu → console. */
export type PreviewEvent =
  | { type: "location"; path: string; hash: string; title: string }
  /** Session fermée par la passerelle (emplacement reparti neuf) : la console en rouvre une. */
  | { type: "closed" }

export function isPreviewCommand(value: unknown): value is PreviewCommand {
  if (!value || typeof value !== "object") return false
  const command = value as Record<string, unknown>
  if (command.type === "theme") return command.theme === "light" || command.theme === "dark"
  return command.type === "renew" && typeof command.token === "string" && TOKEN_SHAPE.test(command.token)
}

export function isPreviewEvent(value: unknown): value is PreviewEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Record<string, unknown>
  if (event.type === "closed") return Object.keys(event).length === 1
  return (
    event.type === "location" &&
    typeof event.path === "string" &&
    event.path.startsWith("/") &&
    event.path.length <= 500 &&
    typeof event.hash === "string" &&
    event.hash.length <= 300 &&
    typeof event.title === "string" &&
    event.title.length <= 300
  )
}

/** Paramètre d'adresse qui porte le jeton à la première visite, échangé contre un cookie. */
export const TOKEN_PARAM = "hd_preview"
/** Chemin du renouvellement du cookie, appelé par le pont avec un jeton frais. */
export const RENEW_PATH = "/_hgdc/renew"
/** En-tête de génération exigé par l'agent d'emplacement sur chaque requête. */
export const GENERATION_HEADER = "x-hgdc-preview-generation"

/** Durée d'un jeton d'entrée, à usage unique : il ne sert qu'à poser le cookie. */
export const TOKEN_TTL_MS = 10 * 60 * 1000
/** Durée du cookie : une heure, renouvelé par la console tant que l'accès au projet tient. */
export const COOKIE_TTL_MS = 60 * 60 * 1000
/** Intervalle de renouvellement par la console (avant l'expiration du cookie). */
export const RENEW_EVERY_MS = 20 * 60 * 1000

/** Limites d'une synchronisation et d'une session : une doc entière, pas un dépôt quelconque. */
export const PREVIEW_LIMITS = {
  files: 2000,
  textBytes: 500_000,
  imageBytes: 5 * 1024 * 1024,
  requestBytes: 40 * 1024 * 1024,
  /** Somme des fichiers d'une session. */
  sessionBytes: 64 * 1024 * 1024,
} as const

/** En-têtes des appels signés de Convex vers la passerelle. */
export const PREVIEW_SIGNATURE_HEADER = "x-hgdc-preview-signature"
export const PREVIEW_TIMESTAMP_HEADER = "x-hgdc-preview-timestamp"
/** Empreinte SHA-256 (hexadécimal) du corps annoncé, signée avec sa taille. */
export const PREVIEW_DIGEST_HEADER = "x-hgdc-preview-content-sha256"
/** Écart d'horloge toléré pour un appel signé. */
export const PREVIEW_SKEW_MS = 5 * 60 * 1000

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function fromBase64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)))
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Identifiant aléatoire en base 36 (minuscules et chiffres), pour un nom DNS ou un nonce. */
export function randomId(length = 26): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map((byte) => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36]).join("")
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Ce qui est signé : horodatage, empreinte et taille du corps. La passerelle le vérifie avant de lire. */
const requestPayload = (timestamp: number, digest: string, length: number) => `request.${timestamp}.${digest}.${length}`

/** En-têtes d'un appel de Convex à la passerelle (`content-length` posé par fetch). */
export async function signPreviewRequest(
  secret: string,
  body: string,
  now = Date.now(),
): Promise<Record<string, string>> {
  const bytes = encoder.encode(body)
  const digest = await sha256Hex(bytes)
  return {
    [PREVIEW_TIMESTAMP_HEADER]: String(now),
    [PREVIEW_DIGEST_HEADER]: digest,
    [PREVIEW_SIGNATURE_HEADER]: base64url(await hmac(secret, requestPayload(now, digest, bytes.length))),
  }
}

/** Première vérification, sur les seuls en-têtes : rien n'est lu d'un appel non signé. */
export async function verifyPreviewHeaders(
  secret: string,
  headers: { timestamp: string | null; digest: string | null; signature: string | null; length: number },
  now = Date.now(),
): Promise<boolean> {
  const time = Number(headers.timestamp)
  if (!headers.signature || !Number.isSafeInteger(time) || Math.abs(now - time) > PREVIEW_SKEW_MS) return false
  if (!headers.digest || !/^[a-f0-9]{64}$/.test(headers.digest) || !Number.isSafeInteger(headers.length)) return false
  const given = fromBase64url(headers.signature)
  return given !== null && sameBytes(given, await hmac(secret, requestPayload(time, headers.digest, headers.length)))
}

/** Vérification complète d'un corps déjà lu (tests, faux serveurs). */
export async function verifyPreviewRequest(
  secret: string,
  headers: { timestamp: string | null; digest: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const bytes = encoder.encode(body)
  if (!(await verifyPreviewHeaders(secret, { ...headers, length: bytes.length }, now))) return false
  return (await sha256Hex(bytes)) === headers.digest
}

/** Ce qu'un jeton ou un cookie ouvre : une session, à une génération de son emplacement. */
export type AccessGrant = { session: string; generation: string; expires: number; nonce: string }

/**
 * `<session>.<génération>.<expiration>.<nonce>.<signature>`. `purpose` sépare le jeton
 * d'entrée (donné par Convex à un membre, à usage unique) du cookie (posé par la passerelle).
 * Lié à la génération : un emplacement rendu à un autre locataire n'accepte plus rien d'avant.
 */
export async function signAccess(secret: string, purpose: "token" | "cookie", grant: AccessGrant): Promise<string> {
  const payload = `${grant.session}.${grant.generation}.${grant.expires}.${grant.nonce}`
  return `${payload}.${base64url(await hmac(secret, `${purpose}.${payload}`))}`
}

export async function verifyAccess(
  secret: string,
  purpose: "token" | "cookie",
  expected: { session: string; generation: string },
  value: string | null | undefined,
  now = Date.now(),
): Promise<AccessGrant | null> {
  if (!value || !TOKEN_SHAPE.test(value)) return null
  const [session, generation, expires, nonce, signature] = value.split(".") as [string, string, string, string, string]
  if (session !== expected.session || generation !== expected.generation || !NONCE.test(nonce)) return null
  const time = Number(expires)
  if (!Number.isSafeInteger(time) || time <= now) return null
  const given = fromBase64url(signature)
  const ok =
    given !== null && sameBytes(given, await hmac(secret, `${purpose}.${session}.${generation}.${expires}.${nonce}`))
  return ok ? { session, generation, expires: time, nonce } : null
}

/** Adresse publique d'une session : `https://<id>.<domaine>` (port gardé en local). */
export function sessionOrigin(publicUrl: string, session: string): string {
  const url = new URL(publicUrl)
  url.hostname = `${session}.${url.hostname}`
  return url.origin
}

/**
 * Hôte d'une requête : la passerelle elle-même (pilotage), une session, ou rien de valable.
 * Un hôte mal formé n'atteint jamais le pilotage.
 */
export function classifyHost(
  host: string | undefined,
  domain: string,
): { kind: "control" } | { kind: "session"; id: string } | { kind: "invalid" } {
  const match = /^([a-z0-9.-]{1,253})(?::(\d{1,5}))?$/.exec((host ?? "").toLowerCase())
  if (!match) return { kind: "invalid" }
  const name = match[1]!
  if (name === domain) return { kind: "control" }
  if (!name.endsWith(`.${domain}`)) return { kind: "invalid" }
  const id = name.slice(0, -(domain.length + 1))
  return SESSION_ID.test(id) ? { kind: "session", id } : { kind: "invalid" }
}
