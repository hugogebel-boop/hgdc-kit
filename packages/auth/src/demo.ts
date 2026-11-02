/**
 * Démo d'une console sur sa vraie interface, sans compte : une organisation fabriquée que tout le
 * monde lit et que personne n'écrit. Commun à tous les produits ; chacun écrit ses données fictives,
 * choisit les queries qu'il ouvre et coupe son moteur pour elle.
 *
 * - Identification : `DEMO_ORGANIZATION_ID`, `DEMO_SLUG`, `isDemoOrganization`, `isDemoPath`.
 * - Garde : `refuseDemo` en tête de toute garde d'écriture ou d'action, `readOrgOrDemo` pour les
 *   seules queries d'affichage (fermé par défaut).
 * - Entrée : un jeton par IP et par entrée (`demoEntryRequest` côté serveur du front, signée sans
 *   transmettre le secret, `takeDemoEntry` côté Convex, `enterDemo` qui ne bloque jamais sur une panne).
 * - Remise à zéro : `runDemoReset` lance le remplissage, puis un battement de heartbeat.
 */

import { ConvexError, v, type VFloat64, type VString } from "convex/values"

/** Identifiant fixe, le même dans chaque produit : jamais un identifiant d'Account (ceux-ci sont aléatoires). */
export const DEMO_ORGANIZATION_ID = "hgdc-demo"
/** `~` : Account ne le produit jamais dans un slug, aucune vraie organisation ne peut prendre cette adresse. */
export const DEMO_SLUG = "~demo"
/** Le visiteur de la démo, sans compte ni session : ne correspond à aucun utilisateur. */
export const DEMO_VISITOR = "demo:visitor"
/** Auteur des lignes fabriquées (`createdBy`, `updatedBy`…) : ne correspond à aucun compte. */
export const DEMO_AUTHOR = "demo"

/** Code d'erreur de toute écriture ou action refusée dans la démo. */
export const DEMO_READ_ONLY = "DEMO_READ_ONLY"
export const DEMO_READ_ONLY_MESSAGE = "La démo est en lecture seule."

export type DemoReadOnlyData = { code: typeof DEMO_READ_ONLY; message: string }

export function isDemoOrganization(organizationId: string | null | undefined): boolean {
  return organizationId === DEMO_ORGANIZATION_ID
}

/**
 * Page de la démo (`/o/~demo/…`, ou sous une base d'un seul segment, `/status/o/~demo/…` ; `~` encodé
 * ou non) : le client Convex n'y attend pas de session. Ancré au début : `/o/acme/x/o/~demo` n'en est pas une.
 */
export function isDemoPath(pathname: string): boolean {
  return /^(?:\/[^/]+)?\/o\/(?:~|%7e)demo(?:\/|$)/i.test(pathname)
}

/**
 * En tête de toute garde d'écriture ou d'action, avant toute lecture de session : la démo est
 * refusée, même pour un admin de la plateforme. Une action de la démo enverrait, appellerait un
 * modèle ou un service : jamais.
 */
export function refuseDemo(organizationId: string | null | undefined, message: string = DEMO_READ_ONLY_MESSAGE): void {
  if (isDemoOrganization(organizationId)) throw new ConvexError<DemoReadOnlyData>({ code: DEMO_READ_ONLY, message })
}

/** Refus de la démo, lu par son code (jamais par son texte) : la console affiche « lecture seule ». */
export function isDemoReadOnly(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false
  const data: unknown = error.data
  return typeof data === "object" && data !== null && "code" in data && data.code === DEMO_READ_ONLY
}

/** Lecteur de la démo : aucune identité, rôle `member` (rien de ce qui est réservé aux admins). */
export type DemoAccess = {
  demo: true
  organizationId: typeof DEMO_ORGANIZATION_ID
  userId: typeof DEMO_VISITOR
  role: "member"
}

export const DEMO_ACCESS: DemoAccess = Object.freeze({
  demo: true,
  organizationId: DEMO_ORGANIZATION_ID,
  userId: DEMO_VISITOR,
  role: "member",
})

/**
 * Garde d'une query d'affichage : la démo est lisible par tous, sans session ; toute autre
 * organisation passe par la garde du produit. Fermé par défaut : seules les queries qui l'appellent
 * s'ouvrent à la démo. La comparaison à la constante précède toute lecture de `ctx.auth` : la
 * réponse ne dépend pas de la personne, et le cache de Convex la partage entre visiteurs.
 *
 * Le produit garde la règle de sa ressource : une query ouverte compare toujours l'organisation de
 * la ressource lue à celle demandée.
 */
export async function readOrgOrDemo<Access>(
  organizationId: string,
  guard: (organizationId: string) => Promise<Access>,
): Promise<DemoAccess | Access> {
  if (isDemoOrganization(organizationId)) return DEMO_ACCESS
  return await guard(organizationId)
}

// --- Entrée : un jeton par IP et par entrée -------------------------------------------------------

/**
 * Seau de l'entrée (réglage du composant `@convex-dev/rate-limiter`) : freine les rechargements en
 * boucle, pas un appel direct à Convex (là, la limite est le coût des queries de la démo, bornées).
 * L'IP comptée doit être celle du visiteur : derrière un relais qui ne la transmet pas, tous les
 * visiteurs partagent un seau, à régler plus large (`rate`, `capacity`, `shards`) par le produit.
 */
export const DEMO_ENTRY_LIMIT: { kind: "token bucket"; rate: number; period: number; capacity: number } = {
  kind: "token bucket",
  rate: 30,
  period: 60_000,
  capacity: 30,
}

/** Clé d'un visiteur : 32 caractères base64url, empreinte HMAC de son IP (jamais l'IP elle-même). */
export const DEMO_ENTRY_READER: RegExp = /^[A-Za-z0-9_-]{32}$/

/**
 * IP posée par la plateforme (`x-real-ip` : edge de Host, Vercel), jamais un `x-forwarded-for` que le
 * navigateur peut écrire lui-même. `null` sans en-tête : l'entrée ne compte alors rien.
 */
export function demoEntryIp(headers: Headers): string | null {
  const ip = headers.get("x-real-ip")?.trim()
  return ip && ip.length <= 64 ? ip : null
}

/**
 * IPv4 entière (sans port) ou préfixe /64 d'une IPv6 : changer d'adresse dans son /64 ne remplit pas
 * un seau neuf. Une IPv4 dans une IPv6 (`::ffff:192.0.2.7`, `::ffff:c000:207`) compte comme l'IPv4.
 */
export function demoEntryAddressKey(ip: string): string {
  const address =
    ip
      .trim()
      .replace(/^\[|\](?::\d+)?$/g, "")
      .split("%")[0] ?? ""
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(address)?.[1]
  if (v4) return v4
  const halves = address.toLowerCase().split("::")
  if (halves.length > 2) return address.slice(0, 64)
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves[1] ? halves[1].split(":") : []
  // Fin en IPv4 pointée (`::ffff:192.0.2.7`) : deux groupes.
  const groups = halves.length === 2 ? tail : head
  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(groups.at(-1) ?? "")
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number]
    groups.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16))
  }
  const count = head.length + tail.length
  if (count > 8 || (halves.length === 1 && count !== 8)) return address.slice(0, 64)
  const full = [...head, ...Array.from({ length: 8 - count }, () => "0"), ...tail]
  if (!full.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address.slice(0, 64)
  const words = full.map((g) => Number.parseInt(g, 16))
  // IPv4 mappée (`::ffff:a.b.c.d`, `::ffff:c000:207`) : la même clé que l'IPv4.
  if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
    const [hi = 0, lo = 0] = words.slice(6)
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".")
  }
  return `${full
    .slice(0, 4)
    .map((g) => g.padStart(4, "0"))
    .join(":")}::/64`
}

/**
 * Côté serveur du front : clé du visiteur pour le seau de l'entrée, ou `null` sans IP (rien n'est
 * compté : les visiteurs sans IP ne partagent pas un seau qu'un seul pourrait vider). Le navigateur ne
 * la choisit pas, Convex ne voit pas l'IP en clair. `secret` : le secret de relais du produit ; Convex
 * le connaît aussi, l'empreinte est donc un pseudonyme, pas un anonymat.
 */
export async function demoEntryReader(secret: string, ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null
  return (await hmac(`demo-entry:${secret}`, demoEntryAddressKey(ip))).slice(0, 32)
}

/**
 * Durée de validité d'une preuve d'entrée, de part et d'autre de l'heure de Convex : couvre l'écart
 * d'horloge entre le front (edge, Vercel) et Convex. Une preuve relue dans un journal ne sert que
 * pendant cette fenêtre, et seulement pour vider le seau du même visiteur.
 */
export const DEMO_ENTRY_PROOF_TTL_MS = 60_000

/**
 * Arguments de `demo.enter` : la clé du visiteur, l'heure de la demande et sa preuve. Le secret de
 * relais ne voyage jamais, ni dans les arguments (journalisés par Convex) ni ailleurs.
 */
export type DemoEntryRequest = { reader: string; at: number; proof: string }

/** Validateurs Convex de `DemoEntryRequest` : `args: DEMO_ENTRY_ARGS` dans la mutation `demo.enter`. */
export const DEMO_ENTRY_ARGS: { reader: VString; at: VFloat64; proof: VString } = {
  reader: v.string(),
  at: v.number(),
  proof: v.string(),
}

/**
 * Côté serveur du front : la demande d'entrée du visiteur, signée par le secret de relais (HMAC-SHA-256
 * de la clé et de l'heure), ou `null` sans IP. Convex refait la signature : il connaît le secret, il ne
 * le reçoit pas.
 */
export async function demoEntryRequest(
  secret: string,
  ip: string | null | undefined,
  now: number = Date.now(),
): Promise<DemoEntryRequest | null> {
  const reader = await demoEntryReader(secret, ip)
  if (!reader) return null
  return { reader, at: now, proof: await demoEntryProof(secret, reader, now) }
}

async function demoEntryProof(secret: string, reader: string, at: number): Promise<string> {
  return await hmac(`demo-entry-proof:${secret}`, `${reader}.${at}`)
}

export type DemoEntryResult = { allowed: boolean; retryAfterMs?: number }

/** Résultat de `RateLimiter.limit` (`@convex-dev/rate-limiter`). */
export type DemoEntryLimit = (reader: string) => Promise<{ ok: boolean; retryAfter?: number | undefined }>

/**
 * Côté Convex, dans la mutation publique `demo.enter` : vérifie la preuve (temps constant) contre chaque
 * secret accepté, puis prend un jeton dans le seau du visiteur.
 *
 * `secrets` : le secret courant et, pendant une rotation, l'ancien (`<NOM>_PREVIOUS`) ; les valeurs
 * absentes sont ignorées. Sans aucun secret configuré, l'entrée passe sans rien compter.
 *
 * Une demande dont la preuve ne tient pas (secret désaccordé, horloge décalée, appel direct d'un
 * navigateur) passe aussi, sans rien compter : l'entrée ne protège aucune donnée, elle freine les
 * rechargements en boucle à travers le front. Ce qui compte est qu'une clé inventée n'écrive jamais
 * de ligne dans le seau, et qu'un secret désaccordé ne ferme jamais la démo. L'écart se voit dans les
 * journaux (`demo-entry-refused`, sans valeur).
 */
export async function takeDemoEntry(
  args: DemoEntryRequest,
  options: { secrets: readonly (string | undefined)[]; limit: DemoEntryLimit; now?: number },
): Promise<DemoEntryResult> {
  const secrets = options.secrets.filter((secret): secret is string => Boolean(secret))
  if (secrets.length === 0) return { allowed: true }
  if (!(await validEntryProof(args, secrets, options.now ?? Date.now()))) {
    console.warn(JSON.stringify({ event: "demo-entry-refused" }))
    return { allowed: true }
  }
  const { ok, retryAfter } = await options.limit(args.reader)
  return ok ? { allowed: true } : { allowed: false, ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }) }
}

async function validEntryProof(args: DemoEntryRequest, secrets: readonly string[], now: number): Promise<boolean> {
  if (!DEMO_ENTRY_READER.test(args.reader) || !Number.isSafeInteger(args.at)) return false
  if (Math.abs(now - args.at) > DEMO_ENTRY_PROOF_TTL_MS) return false
  // Chaque secret est essayé, même après un succès : la durée ne dit pas lequel a servi.
  let valid = false
  for (const secret of secrets) {
    if (await sameDigest(args.proof, await demoEntryProof(secret, args.reader, args.at))) valid = true
  }
  return valid
}

/**
 * Côté serveur du front : `null` quand l'entrée passe, sinon les secondes avant de réessayer. Une
 * panne (Convex injoignable, secret absent) ne bloque jamais : la démo ne coûte que des lectures.
 */
export async function enterDemo(take: (() => Promise<DemoEntryResult>) | null): Promise<number | null> {
  if (!take) return null
  try {
    const taken = await take()
    if (taken.allowed) return null
    return Math.max(1, Math.ceil((taken.retryAfterMs ?? 60_000) / 1000))
  } catch {
    return null
  }
}

/** Texte de l'écran « trop de visites ». */
export function demoBusyMessage(seconds: number): string {
  return `Beaucoup de visites viennent de ton adresse. Réessaie dans ${seconds < 60 ? `${seconds} secondes` : "une minute"}.`
}

/** HMAC-SHA-256 en base64url, sans remplissage (43 caractères). */
async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)))
  let binary = ""
  for (const byte of signature) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

async function sameDigest(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))
  const [da, db] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= da[i]! ^ db[i]!
  return diff === 0
}

// --- Remise à zéro de nuit ---------------------------------------------------------------------

export type DemoResetOptions = {
  /** Adresse de ping du heartbeat Status qui suit la remise à zéro (`DEMO_RESET_PING_URL`) ; absente : aucun battement. */
  pingUrl: string | undefined
  /** Envoi de l'échec au suivi des erreurs du produit (GlitchTip). */
  report: (error: unknown) => Promise<unknown>
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/**
 * Cron de nuit : la remise à zéro, puis un battement. Un échec part au suivi des erreurs, signale
 * `/fail` au heartbeat et se relance ; un cron qui ne tourne plus du tout se voit au battement manquant.
 */
export async function runDemoReset<T>(reset: () => Promise<T>, options: DemoResetOptions): Promise<T> {
  let result: T
  try {
    result = await reset()
  } catch (error) {
    // Un suivi des erreurs en panne ne doit ni masquer l'erreur ni empêcher le `/fail`.
    await options.report(error).catch(() => undefined)
    await pingHeartbeat(options, "/fail")
    throw error
  }
  await pingHeartbeat(options, "")
  return result
}

async function pingHeartbeat(options: DemoResetOptions, suffix: "" | "/fail"): Promise<void> {
  if (!options.pingUrl) return
  try {
    await (options.fetch ?? fetch)(`${options.pingUrl.replace(/\/+$/, "")}${suffix}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    // Le battement manquant suffit à alerter : un Status injoignable ne fait pas échouer la démo.
    console.error("Battement de la démo", error instanceof Error ? error.message : String(error))
  }
}
