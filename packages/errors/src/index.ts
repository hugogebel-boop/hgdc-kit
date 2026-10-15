/**
 * Remontée d'erreurs vers GlitchTip, qui parle le protocole Sentry.
 *
 * Le SDK Sentry ne tourne pas dans l'isolat de Convex et pèserait trente fois ce module dans le
 * navigateur : l'enveloppe est écrite à la main et postée par `fetch`. Ce module est pur (aucun
 * import, aucune variable d'environnement) ; `@hgdc/errors/convex`, `/browser` et `/server`
 * l'habillent pour chaque environnement.
 *
 * - **Éteint sans DSN** : tests, base de dev et poste local restent muets.
 * - **Ne lève jamais** : la télémétrie ne doit pas faire échouer deux fois.
 * - **Borné et nettoyé** : un message de 300 caractères sans e-mail, jeton, clé, ni adresse IP, les
 *   cadres de la pile (jamais sa première ligne, qui répète le message brut), un contexte plat.
 *   Jamais d'argument ni de corps de requête.
 */

export type ErrorContext = Record<string, string | number | boolean | undefined>

export type ErrorReport = {
  /** Où : `vercel-api`, `http`, `browser`… sert d'étiquette et de regroupement. */
  source: string
  error: unknown
  context?: ErrorContext | undefined
}

export type ScrubOptions = {
  /**
   * Préfixes des clés d'API du produit (`["am_"]` pour Mail) : tout ce qui suit est masqué, quelle
   * que soit sa longueur. Les clés plus longues que 16 caractères sont masquées sans cela.
   */
  keyPrefixes?: ReadonlyArray<string> | undefined
}

export type SendOptions = ScrubOptions & {
  dsn: string | undefined
  /** `production` par défaut. */
  environment?: string | undefined
  /** Nom de la machine ou du déploiement : `hip-monitor-87`, `mail.hgdc.ch`. */
  serverName?: string | undefined
  /** `javascript` (navigateur) ou `node` (serveur). */
  platform?: string | undefined
  /** Version déployée (SHA du commit) : GlitchTip groupe alors les erreurs par version. */
  release?: string | undefined
  /** `fetch` sans ses extensions de moteur (`preconnect` de Bun) : le même module sert partout. */
  fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined
}

type ParsedDsn = { endpoint: string; publicKey: string; dsn: string }

const MESSAGE_MAX = 300
const STACK_MAX = 4_000
const SEND_TIMEOUT_MS = 5_000

/** `https://<clé>@<hôte>[:port][/préfixe]/<projet>` ; toute autre forme éteint la remontée. */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null
  let url: URL
  try {
    url = new URL(dsn.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const publicKey = decodeURIComponent(url.username)
  const parts = url.pathname.split("/").filter(Boolean)
  const project = parts.pop()
  if (!publicKey || !project || !/^\d+$/.test(project)) return null
  const prefix = parts.length ? `/${parts.join("/")}` : ""
  return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`, publicKey, dsn: dsn.trim() }
}

const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi
const SECRET_PARAMS =
  /([?&#;](?:token|code|key|api_key|apikey|secret|password|pass|signature|sig|auth|access_token|refresh_token|id_token)=)[^&#\s]*/gi
const BEARER = /\b(Bearer|Basic)\s+[^\s,;"']+/gi
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
// Groupes hexadécimaux séparés par « : ». Une heure (14:32:05) ou une position de pile
// (main.ts:12:34) n'a que deux « : » ; une adresse IPv6 en a au moins trois, ou un « :: ».
const IPV6 = /(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:])/g
// `sk_live_…`, `re_…`, `ah_…` : un préfixe court puis au moins 16 caractères sans « _ ».
const PREFIXED_KEY = /\b[a-z]{2,10}_(?:[a-z]{2,10}_)?[A-Za-z0-9]{16,}\b/g
// Liens de partage, jetons de session, longues suites hexadécimales ou base64.
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Masque ce qui identifie une personne ou ouvre un accès : identifiants d'une URL
 * (`postgres://moi:secret@…`), paramètres sensibles d'une requête (`?token=…`), en-têtes
 * `Bearer`, adresses e-mail, adresses IP (v4 et v6), clés d'API et longs jetons.
 */
export function scrub(text: string, options: ScrubOptions = {}): string {
  let clean = text
    .replace(URL_CREDENTIALS, "$1[identifiants]@")
    .replace(SECRET_PARAMS, "$1[masqué]")
    .replace(BEARER, "$1 [jeton]")
    .replace(EMAIL, "[email]")
    .replace(IPV4, "[ip]")
    .replace(IPV6, (match) => (match.includes("::") || match.split(":").length > 3 ? "[ip]" : match))
  for (const prefix of options.keyPrefixes ?? []) {
    if (prefix) clean = clean.replace(new RegExp(`\\b${escapeRegExp(prefix)}[A-Za-z0-9_-]+`, "g"), "[clé]")
  }
  return clean.replace(PREFIXED_KEY, "[clé]").replace(LONG_TOKEN, "[jeton]")
}

function describe(error: unknown): { type: string; message: string; stack?: string | undefined } {
  if (error instanceof Error) return { type: error.name || "Error", message: error.message, stack: error.stack }
  if (typeof error === "string") return { type: "Error", message: error }
  try {
    return { type: "Error", message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { type: "Error", message: String(error) }
  }
}

/** Les cadres seuls : la première ligne d'une pile répète le message, non borné. */
export function stackFrames(stack: string | undefined, options: ScrubOptions = {}): string | undefined {
  if (!stack) return undefined
  const frames = stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line) || /^[^\s]*@/.test(line))
    .join("\n")
  if (!frames) return undefined
  const clean = scrub(frames, options)
  return clean.length > STACK_MAX ? `${clean.slice(0, STACK_MAX - 1)}…` : clean
}

/**
 * Une `ConvexError` est un message écrit pour la personne (« Ce nom est déjà pris »), pas un
 * défaut : elle ne remonte pas. Reconnue par son nom, pour ne pas dépendre de `convex`.
 */
export function isReportable(error: unknown): boolean {
  return !(error instanceof Error && error.name === "ConvexError")
}

export type EnvelopeOptions = ScrubOptions & {
  dsn: string
  eventId: string
  now: number
  environment: string
  serverName: string
  platform: string
  release?: string | undefined
}

export function buildEnvelope(report: ErrorReport, options: EnvelopeOptions): string {
  const { type, message: raw, stack } = describe(report.error)
  const message = scrub(raw, options).slice(0, MESSAGE_MAX)
  const frames = stackFrames(stack, options)
  const context = Object.fromEntries(
    Object.entries(report.context ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === "string" ? scrub(value, options).slice(0, MESSAGE_MAX) : value]),
  )
  const event = {
    event_id: options.eventId,
    timestamp: options.now / 1000,
    platform: options.platform,
    level: "error",
    environment: options.environment,
    server_name: options.serverName,
    ...(options.release ? { release: options.release } : {}),
    message: { formatted: `${type}: ${message}` },
    exception: { values: [{ type, value: message }] },
    // Les identifiants changent d'une occurrence à l'autre, pas le défaut.
    fingerprint: [report.source, type, message.replace(/\d+/g, "N").slice(0, 120)],
    tags: { source: report.source },
    extra: { ...context, ...(frames ? { stack: frames } : {}) },
  }
  const header = JSON.stringify({
    event_id: options.eventId,
    sent_at: new Date(options.now).toISOString(),
    dsn: options.dsn,
  })
  return `${header}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`
}

/** Poste un rapport. `true` si GlitchTip l'a pris, `false` sinon ; ne rejette jamais. */
export async function sendErrorReport(report: ErrorReport, options: SendOptions): Promise<boolean> {
  try {
    const parsed = parseDsn(options.dsn)
    if (!parsed) return false
    const envelope = buildEnvelope(report, {
      dsn: parsed.dsn,
      eventId: crypto.randomUUID().replace(/-/g, ""),
      now: Date.now(),
      environment: options.environment ?? "production",
      serverName: options.serverName ?? "hgdc",
      platform: options.platform ?? "javascript",
      release: options.release,
      keyPrefixes: options.keyPrefixes,
    })
    const url = `${parsed.endpoint}?sentry_key=${encodeURIComponent(parsed.publicKey)}&sentry_version=7`
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      // text/plain : pas de requête préalable CORS depuis le navigateur.
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: envelope,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    await response.body?.cancel().catch(() => undefined)
    return response.ok
  } catch {
    return false
  }
}

export type RateLimitOptions = {
  /** Écart minimal entre deux remontées d'une même source. 60 s par défaut. */
  perSourceMs?: number | undefined
  /** Plafond toutes sources confondues, par heure glissante. 30 par défaut. */
  perHour?: number | undefined
  now?: (() => number) | undefined
}

/**
 * Limite de débit : une panne pendant un pic ne doit pas noyer GlitchTip. Rend une fonction qui dit
 * si la source peut remonter maintenant, et compte la remontée quand c'est oui.
 */
export function createRateLimit({ perSourceMs = 60_000, perHour = 30, now = Date.now }: RateLimitOptions = {}): (
  source: string,
) => boolean {
  const lastBySource = new Map<string, number>()
  let windowStart = Number.NEGATIVE_INFINITY
  let sentInWindow = 0
  return (source) => {
    const t = now()
    if (t - windowStart >= 60 * 60_000) {
      windowStart = t
      sentInWindow = 0
    }
    const last = lastBySource.get(source)
    if (sentInWindow >= perHour || (last !== undefined && t - last < perSourceMs)) return false
    lastBySource.set(source, t)
    sentInWindow += 1
    return true
  }
}
