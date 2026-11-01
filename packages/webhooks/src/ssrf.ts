/*
 * Garde SSRF des adresses où un produit va envoyer ou lire (webhooks, import d'un site) : une
 * adresse saisie par un client ne doit jamais atteindre le réseau interne ni les métadonnées du
 * fournisseur d'hébergement. Fonctions pures, sauf `resolvesPublicly` (DNS-over-HTTPS par `fetch`).
 */

const INTERNAL_SUFFIX = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|nip\.io|sslip\.io|xip\.io)$/

/**
 * Une IPv4 glissée dans une IPv6 (`::ffff:127.0.0.1`, `::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`,
 * `::7f00:1`) rendue en IPv4 pointée, pour être jugée comme telle. Sinon l'adresse telle quelle.
 */
export function unmapIpv4(ip: string): string {
  const address = ip.toLowerCase().replace(/^\[|\]$/g, "")
  // SIIT (`::ffff:0:a.b.c.d`) compris.
  const tail = address.match(
    /^(?:(?:0{1,4}:){5}ffff:|::ffff:(?:0{1,4}:)?|::(?:0{1,4}:)?ffff:(?:0{1,4}:)?|::)(.+)$/,
  )?.[1]
  if (!tail) return address
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) return tail
  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!hex) return address
  const high = parseInt(hex[1]!, 16)
  const low = parseInt(hex[2]!, 16)
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
}

/** Adresse privée, locale ou réservée (IPv4, IPv6, IPv4 dans IPv6, même en hexadécimal). */
export function isPrivateIp(ip: string): boolean {
  const address = unmapIpv4(ip)
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      // Documentation (198.51.100/24, 203.0.113/24) et ancien relais 6to4 (192.88.99/24).
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 192 && b === 88 && c === 99)
    )
  }
  return (
    address === "::" ||
    address === "::1" ||
    /^f[cd]/.test(address) ||
    // Link-local (fe80::/10) et site-local déprécié (fec0::/10).
    /^fe[89a-f]/.test(address) ||
    // NAT64, 6to4, Teredo, documentation et discard : chacune peut mener à une IPv4 interne, ou nulle part.
    /^64:ff9b:/.test(address) ||
    /^2002:/.test(address) ||
    /^2001:(0{0,4}:|db8:)/.test(address) ||
    /^100::/.test(address) ||
    /^100:0{1,4}:0{1,4}:0{1,4}:/.test(address) ||
    address.startsWith("ff")
  )
}

export type PublicUrlOptions = {
  /** Refuse `http:` (webhooks : `true`). Par défaut http et https passent. */
  httpsOnly?: boolean
}

/**
 * Une adresse qu'on accepte de contacter : http(s), port standard, nom de domaine public, sans
 * identifiants. Ni IP (v4, v6, hexadécimale), ni nom interne (`localhost`, `.internal`, `nip.io`…).
 * À refaire pour chaque redirection suivie.
 */
export function isPublicUrl(url: URL, options: PublicUrlOptions = {}): boolean {
  // « localhost. » est le même nom que « localhost » : le point final ne doit pas déjouer la liste.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "")
  if (url.protocol !== "https:" && (options.httpsOnly || url.protocol !== "http:")) return false
  if (url.port && url.port !== "443" && url.port !== "80") return false
  if (url.username || url.password) return false
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host) || /^0x/i.test(host)) return false
  return !INTERNAL_SUFFIX.test(host)
}

/** Résolution d'un nom en adresses IP ; `null` si illisible (refusé par l'appelant). */
export type DnsLookup = (host: string) => Promise<string[] | null>

/** Résolution par DNS-over-HTTPS (Cloudflare), A et AAAA. */
export function dohLookup(timeoutMs = 8000): DnsLookup {
  return async (host) => {
    const addresses: string[] = []
    for (const type of ["A", "AAAA"]) {
      try {
        const response = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
          { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(timeoutMs) },
        )
        if (!response.ok) return null
        const body = (await response.json()) as { Answer?: Array<{ type: number; data: string }> }
        for (const answer of body.Answer ?? []) if (answer.type === 1 || answer.type === 28) addresses.push(answer.data)
      } catch {
        return null
      }
    }
    return addresses
  }
}

/**
 * Le nom ne pointe-t-il que vers des adresses publiques ? Un domaine public peut viser
 * 169.254.169.254. Pas de réponse lisible : refusé.
 *
 * Limite connue : `fetch` résout le nom une seconde fois et ne permet ni d'imposer l'adresse
 * vérifiée ni de lire celle contactée ; un DNS qui change de réponse entre les deux lectures
 * (rebinding, TTL nul) passe. À compenser côté appelant : pas de cookies ni d'identifiants,
 * redirections refusées, réponse jamais rendue.
 */
export async function resolvesPublicly(url: URL, lookup: DnsLookup = dohLookup()): Promise<boolean> {
  const addresses = await lookup(url.hostname.replace(/\.+$/, ""))
  return Boolean(addresses && addresses.length > 0 && !addresses.some(isPrivateIp))
}

/**
 * L'adresse d'un endpoint de webhook : https, port 443, nom public. Lève une `Error` au message
 * lisible (français) sinon. La résolution DNS se fait à part (`resolvesPublicly`), avant chaque essai.
 */
export function parseWebhookUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error("Cette adresse n'a pas la forme d'une URL. Exemple : https://monsite.ch/webhooks/mail")
  }
  if (url.protocol !== "https:") throw new Error("L'adresse doit commencer par https://.")
  if (url.hash) url.hash = ""
  if (!isPublicUrl(url, { httpsOnly: true }) || url.port) {
    throw new Error("L'adresse doit pointer vers un site public, sur le port 443 : pas d'adresse interne ni d'IP.")
  }
  if (url.toString().length > 500) throw new Error("L'adresse est trop longue.")
  return url
}
