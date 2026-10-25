// Négociation de contenu : un agent qui demande text/markdown le reçoit (acceptmarkdown.com).

type MediaRange = { type: string; q: number }

function parseAccept(accept: string): MediaRange[] {
  return accept
    .split(",")
    .map((part) => {
      const [type = "", ...params] = part.trim().toLowerCase().split(";")
      const q = params.map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined)
      return { type: type.trim(), q: q === undefined ? 1 : Math.min(1, Number(q) || 0) }
    })
    .filter((range) => range.type)
}

/**
 * Vrai si la requête préfère le Markdown au HTML : `text/markdown` accepté (q > 0), avec une qualité au
 * moins égale à celle de `text/html` demandé explicitement. Les jokers (`*\/*`, `text/*`) ne comptent pas :
 * un navigateur ne reçoit jamais de Markdown.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false
  const ranges = parseAccept(accept)
  const quality = (type: string) => Math.max(0, ...ranges.filter((r) => r.type === type).map((r) => r.q))
  const markdown = quality("text/markdown")
  return markdown > 0 && markdown >= quality("text/html")
}

/** Ajoute un nom d'en-tête à `Vary`, sans doublon. */
export function varyOn(headers: Headers, name: string): void {
  const vary = headers.get("vary")
  if (!vary) headers.set("vary", name)
  else if (!vary.split(",").some((v) => [name.toLowerCase(), "*"].includes(v.trim().toLowerCase())))
    headers.set("vary", `${vary}, ${name}`)
}

/** Ajoute `Accept` à l'en-tête `Vary` d'une réponse, sans doublon. */
export function varyOnAccept(headers: Headers): void {
  varyOn(headers, "Accept")
}
