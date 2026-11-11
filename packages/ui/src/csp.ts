/**
 * Politique de sécurité du contenu (CSP) des documents d'une console, commune à tous les modules.
 *
 * Les modules partagent une même origine : un script injecté dans l'un agit dans tous les autres. La
 * politique doit donc être la même partout, d'où ce module. Aucune dépendance : le middleware qui
 * tire le nonce et pose l'en-tête reste dans chaque application (il dépend de son serveur).
 */
import { PRODUCT_SPECULATION_RULES } from "./product-switch.js"

/** Socle : jamais encadrable (clickjacking), ni `<base>`, ni plugin, formulaires vers soi. */
export const BASE_POLICY = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"

/**
 * Empreintes des scripts en ligne que ce paquet rend sans nonce. Aujourd'hui : les règles de
 * préchargement de la barre (`PRODUCT_SPECULATION_RULES`), que Chrome bloque malgré
 * `'inline-speculation-rules'`. `csp.test.ts` les recalcule : changer un script sans son empreinte échoue.
 */
export const KIT_INLINE_SCRIPT_HASHES: readonly string[] = ["sha256-a67/vPhviRex9BGXSAteyrRDrGJEKbTE/4tBKxtGgjQ="]

/** Scripts en ligne couverts par `KIT_INLINE_SCRIPT_HASHES`, pour le test qui recalcule les empreintes. */
export const KIT_INLINE_SCRIPTS: readonly string[] = [PRODUCT_SPECULATION_RULES]

/**
 * Origines que les composants de ce paquet joignent depuis le navigateur : bandeau d'état
 * (`ServiceStatus`), formulaire « Demander un accès » (`AccessRequest`), réglage de la barre.
 */
export const FAMILY_CONNECT_SOURCES: readonly string[] = [
  "https://status.hgdc.ch",
  "https://api.mail.hgdc.ch",
  "https://account.hgdc.ch",
]

/**
 * Origines joignables par `fetch` ou WebSocket, tirées d'adresses complètes (backend, collecteur
 * d'erreurs) : l'origine seule, plus sa version WebSocket. Une adresse vide ou illisible est ignorée :
 * elle ne doit jamais ouvrir la politique.
 */
export function connectSources(urls: ReadonlyArray<string | undefined>): string[] {
  const sources = new Set<string>()
  for (const raw of urls) {
    if (!raw) continue
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue
    sources.add(url.origin)
    sources.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`)
  }
  return [...sources]
}

/** Nonce d'une requête : 16 octets aléatoires en base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

const NONCE = /^[A-Za-z0-9+/_-]{16,}={0,2}$/
const HASH = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/
/** Une source de `connect-src` : une origine `https:`, `wss:`, `http:` ou `ws:`, sans chemin ni séparateur. */
const SOURCE = /^(https|wss|http|ws):\/\/[A-Za-z0-9.*:[\]-]+$/

export type DocumentPolicyOptions = {
  /** Nonce de la requête (`newNonce`), posé aussi sur les scripts en ligne du rendu serveur. */
  nonce: string
  /** Origines que le navigateur joint, en plus de la sienne et de `FAMILY_CONNECT_SOURCES`. */
  connect: ReadonlyArray<string>
  /** Empreintes de scripts en ligne propres à l'application, en plus de celles du paquet. */
  scriptHashes?: ReadonlyArray<string>
}

/**
 * Politique des documents : le socle, `script-src` (fichiers de l'application, scripts en ligne portant
 * le nonce, ceux du paquet par leur empreinte) et `connect-src`. Ni `'unsafe-inline'` ni `'unsafe-eval'`.
 * Images, styles et polices ne sont pas restreints. Une valeur mal formée lève : elle ne doit jamais
 * pouvoir ajouter une directive.
 */
export function documentPolicy({ nonce, connect, scriptHashes = [] }: DocumentPolicyOptions): string {
  if (!NONCE.test(nonce)) throw new Error("nonce CSP invalide")
  const hashes = [...KIT_INLINE_SCRIPT_HASHES, ...scriptHashes]
  for (const hash of hashes) if (!HASH.test(hash)) throw new Error(`empreinte CSP invalide : ${hash}`)
  const sources = [...new Set([...connect, ...FAMILY_CONNECT_SOURCES])]
  for (const source of sources) if (!SOURCE.test(source)) throw new Error(`source CSP invalide : ${source}`)
  return [
    BASE_POLICY,
    `script-src ${["'self'", `'nonce-${nonce}'`, ...hashes.map((hash) => `'${hash}'`), "'inline-speculation-rules'"].join(" ")}`,
    `connect-src ${["'self'", ...sources].join(" ")}`,
  ].join("; ")
}
