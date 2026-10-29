import { crc32, randomBase62, sha256Hex, toBase62 } from "./encoding.ts"

/*
 * Clés d'API des produits : `hgdc_<produit>_<corps>`.
 * - `<produit>` : le mot du produit en minuscules (`mail`, `host`), 2 à 20 caractères, sans `_`.
 * - `<corps>` : 32 caractères base62 tirés au hasard (190 bits), puis 6 caractères base62 de somme
 *   de contrôle (CRC-32 de `hgdc_<produit>_<aléa>`), comme les jetons GitHub : un scanner de secrets
 *   reconnaît une vraie clé hors ligne, sans appeler l'API, et une faute de frappe est refusée
 *   avant toute lecture en base.
 * La base ne garde que l'empreinte SHA-256 (`hashKey`) et un aperçu (`keyPreview`), jamais la clé.
 *
 * Générer dans une **action** Convex, jamais dans une query ou une mutation : Convex rend le
 * hasard de ces fonctions déterministe (rejouable), une clé tirée là serait prévisible. L'action
 * tire la clé, puis passe l'empreinte et l'aperçu à une mutation interne qui les enregistre.
 */

export const KEY_PREFIX = "hgdc_"
const RANDOM_LENGTH = 32
const CHECKSUM_LENGTH = 6
const PRODUCT = /^[a-z][a-z0-9]{1,19}$/
const KEY = /^hgdc_([a-z][a-z0-9]{1,19})_([0-9A-Za-z]{32})([0-9A-Za-z]{6})$/

export type ParsedKey = { product: string; random: string; checksum: string }

function checksum(product: string, random: string): string {
  return toBase62(crc32(`${KEY_PREFIX}${product}_${random}`), CHECKSUM_LENGTH)
}

function assertProduct(product: string): void {
  if (!PRODUCT.test(product)) throw new Error(`Produit de clé invalide : ${product}`)
}

/** Une clé neuve. Lève si `product` n'a pas la forme attendue. À appeler dans une action (voir plus haut). */
export function generateKey(product: string): string {
  assertProduct(product)
  const random = randomBase62(RANDOM_LENGTH)
  return `${KEY_PREFIX}${product}_${random}${checksum(product, random)}`
}

/** Empreinte SHA-256 (hexadécimal) d'une clé : ce que la base garde et cherche par index. */
export async function hashKey(key: string): Promise<string> {
  return await sha256Hex(key)
}

/** Aperçu affichable : `hgdc_mail_…x9Qa`. Ne permet pas de retrouver la clé. */
export function keyPreview(key: string): string {
  const parsed = parseKey(key)
  if (parsed) return `${KEY_PREFIX}${parsed.product}_…${parsed.checksum.slice(-4)}`
  return `${key.slice(0, Math.min(5, Math.max(0, key.length - 8)))}…${key.slice(-4)}`
}

/** Une clé neuve, son empreinte et son aperçu. La clé ne se montre qu'une fois, à la création. */
export async function createKey(product: string): Promise<{ key: string; hash: string; preview: string }> {
  const key = generateKey(product)
  return { key, hash: await hashKey(key), preview: keyPreview(key) }
}

/** Les parties d'une clé à la bonne forme et à la bonne somme de contrôle, sinon `null`. */
export function parseKey(key: string): ParsedKey | null {
  const match = KEY.exec(key)
  if (!match) return null
  const [, product, random, sum] = match as unknown as [string, string, string, string]
  return sum === checksum(product, random) ? { product, random, checksum: sum } : null
}

/** Forme et somme de contrôle justes ; `product` en plus, la clé doit être de ce produit. */
export function isValidKey(key: string, product?: string): boolean {
  const parsed = parseKey(key)
  return parsed !== null && (product === undefined || parsed.product === product)
}

/** Expression régulière pour les scanners de secrets (gitleaks, GitHub) : clés de tous les produits. */
export const KEY_PATTERN: RegExp = /\bhgdc_[a-z][a-z0-9]{1,19}_[0-9A-Za-z]{38}\b/

/**
 * Accepte les anciennes clés d'un produit pendant leur migration (`am_`, `ah_`, `pmcp_`…). Le
 * produit cherche ensuite l'empreinte de la clé, quelle que soit sa forme : seule la forme change.
 */
export function isLegacyKey(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix.length > 0 && key.startsWith(prefix) && key.length >= prefix.length + 16)
}

export type KeyKind = "current" | "legacy" | "invalid"

/** Trie un jeton reçu : clé actuelle du produit, ancienne clé acceptée, ou rien. */
export function classifyKey(key: string, options: { product: string; legacyPrefixes?: readonly string[] }): KeyKind {
  if (isValidKey(key, options.product)) return "current"
  if (options.legacyPrefixes && isLegacyKey(key, options.legacyPrefixes)) return "legacy"
  return "invalid"
}

/* Scopes : `<produit>:<droit>`, en minuscules (`mail:read`, `host:write`). */

const SCOPE = /^[a-z][a-z0-9]{1,19}:[a-z][a-z0-9_]{0,31}$/

/** Droits qui en incluent d'autres : `write` donne `read`, `admin` donne les deux. */
const IMPLIED: Readonly<Record<string, readonly string[]>> = {
  write: ["read"],
  admin: ["write", "read"],
}

/**
 * Scopes d'une chaîne OAuth (séparés par des espaces) ou d'un tableau. Un scope mal formé est
 * ignoré : il ne donne aucun droit. Sans doublon, triés.
 */
export function parseScopes(input: string | readonly string[] | null | undefined): string[] {
  const parts = typeof input === "string" ? input.split(/[\s,]+/) : (input ?? [])
  return [...new Set(parts.map((s) => s.trim()).filter((s) => SCOPE.test(s)))].toSorted()
}

/** Vrai si `granted` donne `required`, directement ou par inclusion (`mail:write` donne `mail:read`). */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (!SCOPE.test(required)) return false
  if (granted.includes(required)) return true
  const [product, right] = required.split(":") as [string, string]
  return granted.some((scope) => {
    const [p, r] = scope.split(":") as [string, string]
    return p === product && (IMPLIED[r] ?? []).includes(right)
  })
}

/** Les scopes de lecture et d'écriture d'un produit, dans l'ordre. */
export function productScopes(product: string): [string, string] {
  assertProduct(product)
  return [`${product}:read`, `${product}:write`]
}

/** Ce qu'un produit garde d'une clé. Les dates sont en millisecondes (`Date.now()`). */
export type ApiKeyRecord = {
  hash: string
  preview: string
  product: string
  scopes: string[]
  createdAt: number
  /** `null` ou absent : n'expire pas. */
  expiresAt?: number | null
  lastUsedAt?: number | null
  revokedAt?: number | null
}

export type KeyStatus = "active" | "expired" | "revoked"

export function keyStatus(record: Pick<ApiKeyRecord, "expiresAt" | "revokedAt">, now: number): KeyStatus {
  if (record.revokedAt != null) return "revoked"
  if (record.expiresAt != null && record.expiresAt <= now) return "expired"
  return "active"
}

/** Écart minimal entre deux écritures de `lastUsedAt` : une écriture par requête ferait des conflits. */
export const LAST_USED_INTERVAL_MS = 60_000

/** Faut-il réécrire `lastUsedAt` ? Une fois par minute au plus, par défaut. */
export function shouldTouchLastUsed(
  lastUsedAt: number | null | undefined,
  now: number,
  intervalMs: number = LAST_USED_INTERVAL_MS,
): boolean {
  return lastUsedAt == null || now - lastUsedAt >= intervalMs
}
