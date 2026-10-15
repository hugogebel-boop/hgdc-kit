/**
 * Domaines personnalisés des produits HGDC (Host, Status…) : ce que la personne saisit, ce
 * qu'elle doit poser chez son fournisseur DNS, et ce que le DNS répond.
 *
 * Tout est pur sauf `resolve`, qui interroge deux résolveurs DNS-over-HTTPS par `fetch` (le
 * `fetch` se passe en option pour les tests). Aucune variable d'environnement, aucune
 * dépendance : le module tourne dans Convex, le navigateur, Bun et Node.
 */

export type RecordType = "A" | "AAAA" | "CNAME" | "TXT"

// --- Noms ---------------------------------------------------------------------------

const HOSTNAME = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/

/**
 * Nom de domaine normalisé (minuscules, sans schéma, chemin, port ni point final), ou `null`
 * s'il n'est pas valide. `https://Status.Exemple.ch/page` donne `status.exemple.ch`. Les noms
 * internationalisés se saisissent sous leur forme ASCII (`xn--…`).
 */
export function normalizeHostname(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
  return HOSTNAME.test(host) ? host : null
}

/**
 * Suffixes publics à deux étiquettes les plus courants. Sans la liste complète des suffixes
 * publics (plus de 200 ko), `exemple.co.uk` serait pris pour un sous-domaine de `co.uk`. Les
 * produits HGDC servent la Suisse (`.ch`, `.li`, `.swiss`) : la liste ne sert qu'aux cas rares.
 */
export const MULTI_LABEL_SUFFIXES: ReadonlyArray<string> = [
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "com.br",
  "com.cn",
  "co.za",
  "com.tr",
  "com.mx",
  "co.in",
  "co.at",
  "or.at",
]

/**
 * Domaine enregistrable (celui qu'on achète) : `status.exemple.ch` donne `exemple.ch`,
 * `status.exemple.co.uk` donne `exemple.co.uk`. Approximation par `MULTI_LABEL_SUFFIXES`.
 */
export function registrableDomain(hostname: string, suffixes: ReadonlyArray<string> = MULTI_LABEL_SUFFIXES): string {
  const labels = hostname.split(".")
  const lastTwo = labels.slice(-2).join(".")
  const size = suffixes.includes(lastTwo) ? 3 : 2
  return labels.slice(-size).join(".")
}

/**
 * Domaine racine (`exemple.ch`) : le DNS y interdit un CNAME, il faut un enregistrement A.
 * Un sous-domaine (`status.exemple.ch`) se fait pointer par CNAME.
 */
export function isApex(hostname: string, suffixes: ReadonlyArray<string> = MULTI_LABEL_SUFFIXES): boolean {
  return registrableDomain(hostname, suffixes) === hostname
}

/** `hostname` est `zone` ou l'un de ses sous-domaines. */
export function isWithin(hostname: string, zone: string): boolean {
  return hostname === zone || hostname.endsWith(`.${zone}`)
}

/** `hostname` appartient à l'une des zones (domaines de la plateforme qu'un client ne peut pas revendiquer). */
export function isWithinAny(hostname: string, zones: ReadonlyArray<string>): boolean {
  return zones.some((zone) => isWithin(hostname, zone))
}

/**
 * Nom tel qu'il se saisit chez la plupart des fournisseurs DNS, relatif au domaine
 * enregistrable : `_hgdc-status.status.exemple.ch` donne `_hgdc-status.status` ;
 * `exemple.ch` donne `@`.
 */
export function relativeName(name: string, hostname: string = name): string {
  const zone = registrableDomain(hostname)
  if (name === zone) return "@"
  return name.endsWith(`.${zone}`) ? name.slice(0, -(zone.length + 1)) : name
}

// --- Preuve de propriété ---------------------------------------------------------------

/** Nom de l'enregistrement TXT de preuve : `_<prefix>.<hostname>` (`_agenthost.www.exemple.ch`). */
export function verificationName(prefix: string, hostname: string): string {
  return `_${prefix}.${hostname}`
}

/**
 * Valeur du TXT de preuve, propre à un rattachement : `<prefix>-verify=<32 caractères hex>`.
 * Pas un secret (elle est publiée dans le DNS) ; elle doit seulement être imprévisible pour
 * qu'une autre personne ne puisse pas la poser d'avance.
 */
export function verificationToken(prefix: string, random: () => string = () => crypto.randomUUID()): string {
  return `${prefix}-verify=${random().replaceAll("-", "").toLowerCase()}`
}

// --- Enregistrements -------------------------------------------------------------------

/**
 * Valeur DNS comparable : guillemets et découpage des TXT longs retirés (`"ab" "cd"` donne
 * `abcd`), point final retiré, minuscules.
 */
export function cleanRecord(value: string): string {
  return value.replace(/"\s*"/g, "").replace(/"/g, "").replace(/\.$/, "").trim().toLowerCase()
}

/** Deux valeurs DNS désignent la même chose (`Cname.Vercel-DNS.com.` et `cname.vercel-dns.com`). */
export function sameRecord(a: string, b: string): boolean {
  return cleanRecord(a) === cleanRecord(b)
}

/** La valeur attendue figure parmi les réponses. `false` si le résolveur n'a rien dit (`null`). */
export function hasRecord(found: ReadonlyArray<string> | null, expected: string): boolean {
  return Boolean(found?.some((value) => sameRecord(value, expected)))
}

/** Toutes les adresses trouvées sont parmi celles attendues (domaine racine pointé par A). */
export function sameAddresses(found: ReadonlyArray<string> | null, expected: ReadonlyArray<string>): boolean {
  if (!found?.length || !expected.length) return false
  const allowed = new Set(expected.map(cleanRecord))
  return found.every((ip) => allowed.has(cleanRecord(ip)))
}

export type DomainObservation = {
  /** Réponses TXT sur le nom de preuve, `null` si aucun résolveur n'a répondu. */
  txt: ReadonlyArray<string> | null
  /** Réponses CNAME sur le domaine, `null` si aucun résolveur n'a répondu. */
  cname: ReadonlyArray<string> | null
  /** Réponses A sur le domaine (domaine racine), facultatives. */
  addresses?: ReadonlyArray<string> | null | undefined
}

export type DomainExpectation = {
  /** Valeur du TXT de preuve. */
  token: string
  /** Cible du CNAME attendue (sous-domaine). */
  cnameTarget?: string | undefined
  /** Autres cibles acceptées (ancienne cible générique d'un fournisseur). */
  cnameAlternatives?: ReadonlyArray<string> | undefined
  /** Adresses attendues (domaine racine). */
  addresses?: ReadonlyArray<string> | undefined
}

export type DomainEvaluation =
  /** Un résolveur n'a pas répondu : ne rien conclure, ne rien changer. */
  { conclusive: false } | { conclusive: true; owned: boolean; pointing: boolean }

/**
 * Ce que disent les réponses DNS : propriété prouvée (le TXT y est), trafic dirigé vers la
 * plateforme (CNAME, ou mêmes adresses pour un domaine racine). Sans réponse TXT ou CNAME,
 * rien n'est conclu : une panne de résolveur ne doit jamais faire tomber un domaine.
 */
export function evaluateDomain(observed: DomainObservation, expected: DomainExpectation): DomainEvaluation {
  if (observed.txt === null || observed.cname === null) return { conclusive: false }
  const owned = hasRecord(observed.txt, expected.token)
  const targets = [expected.cnameTarget, ...(expected.cnameAlternatives ?? [])].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  )
  const pointing =
    targets.some((target) => hasRecord(observed.cname, target)) ||
    sameAddresses(observed.addresses ?? null, expected.addresses ?? [])
  return { conclusive: true, owned, pointing }
}

// --- Instructions à afficher -----------------------------------------------------------

/** Même forme que `DnsRecord` de `@hgdc/ui/dns-record-table`, sans en dépendre. */
export type DnsInstruction = {
  id: string
  type: RecordType
  /** Relatif au domaine enregistrable, tel qu'il se saisit chez le fournisseur. */
  name: string
  /** Nom complet, pour les fournisseurs qui le demandent. */
  fqdn: string
  value: string
  status?: "verified" | "pending" | "failed" | "not_started"
}

export type InstructionInput = {
  hostname: string
  /** Cible du CNAME (sous-domaine) ; ignorée pour un domaine racine. */
  cnameTarget?: string | undefined
  /** Adresse A (domaine racine) ; sans elle, un domaine racine n'a pas de ligne de pointage. */
  address?: string | undefined
  /** TXT de preuve : nom complet et valeur. */
  verification?: { name: string; value: string } | undefined
  /** TXT supplémentaires (défi d'un hébergeur, par exemple). */
  extra?: ReadonlyArray<{ name: string; value: string }> | undefined
  /** Résultat du dernier contrôle, s'il y en a eu un. */
  checks?: { owned?: boolean | undefined; pointing?: boolean | undefined } | undefined
}

function lineStatus(ok: boolean | undefined): DnsInstruction["status"] {
  if (ok === undefined) return "not_started"
  return ok ? "verified" : "pending"
}

/**
 * Les enregistrements à poser, dans l'ordre où les poser : la preuve TXT d'abord (elle ne
 * change rien au trafic), puis le pointage.
 */
export function dnsInstructions(input: InstructionInput): DnsInstruction[] {
  const { hostname, checks } = input
  const rows: DnsInstruction[] = []
  if (input.verification)
    rows.push({
      id: "verification",
      type: "TXT",
      name: relativeName(input.verification.name, hostname),
      fqdn: input.verification.name,
      value: input.verification.value,
      status: lineStatus(checks?.owned),
    })
  for (const [index, extra] of (input.extra ?? []).entries())
    rows.push({
      id: `extra-${index}`,
      type: "TXT",
      name: relativeName(extra.name, hostname),
      fqdn: extra.name,
      value: extra.value,
      status: lineStatus(checks?.owned),
    })
  const pointing = isApex(hostname)
    ? input.address && { type: "A" as const, value: input.address }
    : input.cnameTarget && { type: "CNAME" as const, value: cleanRecord(input.cnameTarget) }
  if (pointing)
    rows.push({
      id: "pointing",
      ...pointing,
      name: relativeName(hostname),
      fqdn: hostname,
      status: lineStatus(checks?.pointing),
    })
  return rows
}

// --- Résolution ------------------------------------------------------------------------

/** Codes de type DNS (RFC 1035, 3596) : une réponse TXT sur un alias contient aussi la ligne CNAME, à écarter. */
const TYPE_CODE: Record<RecordType, number> = { A: 1, CNAME: 5, TXT: 16, AAAA: 28 }

export const DEFAULT_RESOLVERS: ReadonlyArray<string> = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
]

export type ResolveOptions = {
  fetch?: typeof fetch | undefined
  resolvers?: ReadonlyArray<string> | undefined
  /** Délai par résolveur, 5 s par défaut. */
  timeoutMs?: number | undefined
}

type DohAnswer = { type: number; data: string }

async function askResolver(
  base: string,
  name: string,
  type: RecordType,
  { fetch: doFetch = fetch, timeoutMs = 5000 }: ResolveOptions,
): Promise<string[] | null> {
  try {
    const response = await doFetch(`${base}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { Status?: number; Answer?: DohAnswer[] }
    // 0 : réponse ; 3 : le nom n'existe pas. Le reste (SERVFAIL, refus) ne permet pas de conclure.
    if (body.Status !== 0 && body.Status !== 3) return null
    return (body.Answer ?? []).filter((a) => a.type === TYPE_CODE[type]).map((a) => cleanRecord(a.data))
  } catch {
    return null
  }
}

/**
 * Résolution par DNS-over-HTTPS chez deux résolveurs publics, réponses réunies : un
 * enregistrement tout neuf apparaît chez l'un avant l'autre. `null` quand aucun n'a répondu
 * (panne, délai dépassé), pour ne pas conclure à une absence.
 */
export async function resolve(name: string, type: RecordType, options: ResolveOptions = {}): Promise<string[] | null> {
  const resolvers = options.resolvers ?? DEFAULT_RESOLVERS
  const results = await Promise.all(resolvers.map((base) => askResolver(base, name, type, options)))
  const answered = results.filter((r): r is string[] => r !== null)
  return answered.length ? [...new Set(answered.flat())] : null
}
