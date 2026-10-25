# @hgdc/agents

Rendre un site lisible par les agents IA : chaque page existe en Markdown, servie quand la requête accepte `text/markdown` ([acceptmarkdown.com](https://acceptmarkdown.com)), avec `Vary: Accept`. Une page introuvable reste en 404, en Markdown pour un agent. Le HTML servi aux navigateurs ne change pas.

Sans dépendance. Le convertisseur vise le HTML qu'un produit rend lui-même (Astro, React SSR) : il lit le `<main>` (sinon le `<body>`) et laisse de côté ce qui est caché aux lecteurs d'écran (`aria-hidden`, `visually-hidden`, `hidden`), les scripts, les styles, les SVG et les formulaires.

## App rendue côté serveur (TanStack Start)

TanStack Start répond 406 à une requête sans `text/html` ni `*/*`. Le point d'entrée serveur enrobe donc son handler, avant le routeur :

```ts
// src/server.ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { linksFooter, withMarkdown } from "@hgdc/agents"

const fetch = withMarkdown(handler.fetch, {
  footer: linksFooter([{ label: "Résumé pour les agents", href: "https://app.hgdc.ch/mail/llms.txt" }]),
})

export default createServerEntry({ fetch })
```

Pour un site servi à la racine de son hôte (Status, Portal, Account), les options ajoutent ce que les agents vérifient avant de recommander un site :

```ts
import { HGDC_TRUST_PAGES, productJsonLd, withMarkdown } from "@hgdc/agents"

withMarkdown(handler.fetch, {
  footer,
  redirects: HGDC_TRUST_PAGES, // /about, /contact, /privacy → pages de hgdc.ch (301)
  jsonLd: productJsonLd({ name: "Status", url: "https://status.hgdc.ch", description: "…" }),
  canonicalOrigin: "https://status.hgdc.ch", // <link rel="canonical"> des pages en 200
  apiPrefix: "/api", // 404 sous /api en application/problem+json
})
```

Le JSON-LD et l'adresse canonique s'insèrent en flux avant `</head>`, seulement si la page n'en porte pas déjà : le rendu SSR en streaming n'est pas retenu au-delà du `<head>`.

Pour la découverte (0.5.0) :

```ts
withMarkdown(handler.fetch, {
  links: ['</llms.txt>; rel="describedby"', '</.well-known/api-catalog>; rel="api-catalog"'], // en-tête Link des pages en 200
  apiCatalog: [
    { anchor: "https://status.hgdc.ch/", "service-desc": [{ href: "https://status.hgdc.ch/openapi.json" }] },
  ], // RFC 9727
  markdownFiles: { "/auth.md": AUTH_MD }, // servis tels quels en text/markdown
})
```

Une page est convertie en Markdown, pour un GET ou un HEAD, quand la requête le préfère (`prefersMarkdown` : `text/markdown` accepté avec une qualité au moins égale à `text/html` ; un joker ne compte pas), quand le User-Agent est celui d'un robot d'IA connu (`isAgentUserAgent` : GPTBot, ClaudeBot, PerplexityBot et leurs variantes « -User » ; Googlebot garde le HTML), avec `?mode=agent`, ou par son jumeau `.md` (`/index.md`, `/tarifs.md`) quand l'app ne sert pas elle-même ce fichier. Les pages portent `Vary: Accept, User-Agent` et, en 200, un `Link` vers leur alternative. Une redirection, un fichier ou du JSON passent tels quels.

## Site prérendu (Astro, sortie Build Output API)

À la fin du build, `@hgdc/agents/build` écrit `<page>.md` à côté de chaque page et donne les routes qui les servent, sur HGDC Host comme sur Vercel :

```js
import { markdownRoutes, writeMarkdownPages } from "@hgdc/agents/build"

// astro:build:done ({ dir }), après l'adaptateur Vercel qui a écrit .vercel/output/config.json
const pages = await writeMarkdownPages(dir, { site: "https://hgdc.ch", footer })
const { before, miss } = markdownRoutes(pages, { site: "https://hgdc.ch" })
config.routes.unshift(...before) // avant { handle: "filesystem" }
config.routes.splice(-1, 0, ...miss) // juste avant la page 404 de l'adaptateur
```

`base` (`/agence`) sert un site publié sous un chemin : son accueil s'écrit `<base>/index.md` et sa 404 Markdown reste sous le préfixe.

## Référence

| Export                                                            | Rôle                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `htmlToMarkdown(html, url)`                                       | Markdown du contenu d'une page, liens rendus absolus      |
| `prefersMarkdown(accept)`                                         | La requête préfère-t-elle le Markdown ?                   |
| `withMarkdown(fetch, { footer })`                                 | Handler `fetch` qui sert le Markdown aux agents           |
| `linksFooter(links)`                                              | Pied de page : liens séparés par « · »                    |
| `HGDC_TRUST_PAGES`, `HGDC_ORGANIZATION`, `productJsonLd(product)` | Pages de confiance et données structurées de l'entreprise |
| `injectIntoHead(body, extra)`                                     | Insère des balises avant `</head>` d'un flux HTML         |
| `varyOnAccept(headers)`, `varyOn(headers, name)`                  | Ajoute un en-tête à `Vary`                                |
| `isAgentUserAgent`, `markdownTwin`, `pageOfTwin`                  | Robots d'IA, jumeau `.md` d'une page                      |
| `apiCatalogResponse`, `appendLinks`                               | Catalogue d'API (RFC 9727), en-tête `Link`                |
| `writeMarkdownPages(dir, options)` (`/build`)                     | Écrit les `.md` d'un build prérendu                       |
| `markdownRoutes(pages, options)` (`/build`)                       | Routes Build Output API v3 qui les servent                |
