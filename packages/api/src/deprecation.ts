/*
 * Versions et dépréciation des API publiques. Une route dépréciée annonce sa date de dépréciation
 * (`Deprecation`, RFC 9745), sa date de retrait (`Sunset`, RFC 8594) et la page qui explique la
 * migration (`Link`, relations `deprecation` et `sunset`).
 */

const DAY = 24 * 60 * 60 * 1000

/** Durée minimale entre l'annonce d'une dépréciation et le retrait de la route : 180 jours. */
export const MIN_SUNSET_NOTICE_DAYS = 180

/** Le texte de la règle, repris dans chaque document OpenAPI (`info.description`). */
export const API_LIFECYCLE_POLICY: string = `## Versions et dépréciation

La version est dans le chemin de l'adresse (\`/api/v1\`, par exemple). Dans une même version, les changements ne cassent rien : nouvelles routes, nouveaux champs de réponse, nouveaux paramètres facultatifs. Un client doit ignorer les champs qu'il ne connaît pas. Un changement qui casse (champ retiré ou renommé, type changé, paramètre devenu obligatoire) ouvre une nouvelle version (\`v2\`) ; l'ancienne reste servie.

Une route dépréciée reste servie au moins ${MIN_SUNSET_NOTICE_DAYS} jours après l'annonce. Chacune de ses réponses porte :

- \`Deprecation\` (RFC 9745) : la date de la dépréciation ;
- \`Sunset\` (RFC 8594) : la date à partir de laquelle la route peut ne plus répondre ;
- \`Link\` avec \`rel="deprecation"\` et \`rel="sunset"\` : la page qui décrit le remplacement.

Dans ce document, une opération dépréciée porte \`deprecated: true\`.

## Limites de débit

Les réponses portent \`RateLimit-Policy\` et \`RateLimit\` (draft-ietf-httpapi-ratelimit-headers) quand une limite s'applique : quota, fenêtre, requêtes restantes et délai avant la remise à plein. Une réponse \`429\` porte toujours \`Retry-After\` (secondes) : attendre ce délai avant de réessayer.`

/** Une route dépréciée : dates et page de migration. */
export type Deprecation = {
  /** Date de l'annonce. */
  deprecatedAt: Date
  /** Date de retrait, au moins `MIN_SUNSET_NOTICE_DAYS` après `deprecatedAt`. */
  sunsetAt: Date
  /** Page publique (https) qui décrit le remplacement. */
  link: string
}

function assertDeprecation({ deprecatedAt, sunsetAt, link }: Deprecation): void {
  if (Number.isNaN(deprecatedAt.getTime()) || Number.isNaN(sunsetAt.getTime())) throw new Error("Date invalide.")
  if (sunsetAt.getTime() - deprecatedAt.getTime() < MIN_SUNSET_NOTICE_DAYS * DAY)
    throw new Error(`Retrait moins de ${MIN_SUNSET_NOTICE_DAYS} jours après l'annonce.`)
  if (!isHttps(link)) throw new Error(`Page de migration invalide : ${link}`)
}

function isHttps(link: string): boolean {
  try {
    return new URL(link).protocol === "https:"
  } catch {
    return false
  }
}

/** Les en-têtes `Deprecation`, `Sunset` et `Link` d'une route dépréciée. */
export function deprecationHeaders(deprecation: Deprecation): Record<string, string> {
  assertDeprecation(deprecation)
  const link = new URL(deprecation.link).href
  return {
    Deprecation: `@${Math.floor(deprecation.deprecatedAt.getTime() / 1000)}`,
    Sunset: deprecation.sunsetAt.toUTCString(),
    Link: `<${link}>; rel="deprecation"; type="text/html", <${link}>; rel="sunset"; type="text/html"`,
  }
}

/**
 * Pose les en-têtes de dépréciation sur la réponse d'une route (`Link` s'ajoute à un `Link` déjà
 * présent). Rend une nouvelle réponse : celle de `fetch` a des en-têtes immuables.
 */
export function withDeprecation(response: Response, deprecation: Deprecation): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(deprecationHeaders(deprecation))) {
    const existing = name === "Link" ? headers.get("Link") : null
    headers.set(name, existing ? `${existing}, ${value}` : value)
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
