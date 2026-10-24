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

Seuls les GET et HEAD qui préfèrent le Markdown sont convertis (`prefersMarkdown` : `text/markdown` accepté avec une qualité au moins égale à `text/html` ; un joker ne compte pas). Une redirection, un fichier ou du JSON passent tels quels.

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

| Export                                        | Rôle                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `htmlToMarkdown(html, url)`                   | Markdown du contenu d'une page, liens rendus absolus |
| `prefersMarkdown(accept)`                     | La requête préfère-t-elle le Markdown ?              |
| `withMarkdown(fetch, { footer })`             | Handler `fetch` qui sert le Markdown aux agents      |
| `linksFooter(links)`                          | Pied de page : liens séparés par « · »               |
| `varyOnAccept(headers)`                       | Ajoute `Accept` à `Vary`                             |
| `writeMarkdownPages(dir, options)` (`/build`) | Écrit les `.md` d'un build prérendu                  |
| `markdownRoutes(pages, options)` (`/build`)   | Routes Build Output API v3 qui les servent           |
