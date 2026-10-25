// Ajout de balises dans le <head> d'une page HTML servie en flux (rendu SSR en streaming) : le début du
// document est retenu jusqu'à `</head>`, la suite passe telle quelle.

/** Au-delà, la page n'a pas de `</head>` lisible : elle passe sans ajout. */
const MAX_HEAD = 256 * 1024

/**
 * Corps HTML avec `extra(head)` inséré juste avant `</head>`. `extra` reçoit le `<head>` déjà rendu, pour
 * ne rien ajouter que la page porte déjà ; une chaîne vide n'ajoute rien.
 */
export function injectIntoHead(
  body: ReadableStream<Uint8Array>,
  extra: (head: string) => string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let done = false
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (done) return controller.enqueue(chunk)
        buffer += decoder.decode(chunk, { stream: true })
        const end = buffer.search(/<\/head>/i)
        if (end === -1 && buffer.length < MAX_HEAD) return
        done = true
        const out = end === -1 ? buffer : buffer.slice(0, end) + extra(buffer.slice(0, end)) + buffer.slice(end)
        controller.enqueue(encoder.encode(out))
        buffer = ""
      },
      flush(controller) {
        if (!done && buffer) controller.enqueue(encoder.encode(buffer + decoder.decode()))
      },
    }),
  )
}

/** JSON-LD sûr dans un `<script>` : `<` échappé, la balise ne peut pas se fermer avant la fin. */
export const jsonLdScript = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** `<link rel="canonical">` pour une adresse absolue. */
export const canonicalLink = (href: string) => `<link rel="canonical" href="${escapeAttribute(href)}">`
