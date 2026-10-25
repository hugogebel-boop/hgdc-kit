# @hgdc/agents

## 0.4.0

### Minor Changes

- 03c3a03: `HGDC_DISCOVERY_FILES` (catalogue ARD et index Agent Skills de hgdc.ch, pour `redirects`), `sameAs` sur `HGDC_ORGANIZATION`, et un nœud `SoftwareApplication` dans `productJsonLd`.

## 0.3.0

### Minor Changes

- 3c9e522: Le Markdown servi aux agents s'ouvre sur un frontmatter YAML (titre, description et adresse canonique lus dans le `<head>`) : `pageFrontmatter`, appliqué par `writeMarkdownPages` et `withMarkdown`.

## 0.2.0

### Minor Changes

- eaaa0fd: `withMarkdown` : options `redirects` (pages de confiance, `HGDC_TRUST_PAGES`), `jsonLd` et `canonicalOrigin` (insérés en flux dans le `<head>`), `apiPrefix` (404 sous l'API en `application/problem+json`). Nouveaux exports `HGDC_ORGANIZATION`, `productJsonLd`, `injectIntoHead`.

## 0.1.2

### Patch Changes

- cc4d039: `markdownRoutes` : l'accueil d'un site sous préfixe (`base`) sert aussi son Markdown avec la barre finale (`/agence/`), forme que relaie le site parent.

## 0.1.1

### Patch Changes

- 400a32e: `htmlToMarkdown` ignore les éléments de classe Tailwind `hidden` (moitié sombre d'un logo clair et sombre), comme `visually-hidden`.

## 0.1.0

### Minor Changes

- 3b1f0a3: Nouveau paquet : version Markdown des pages pour les agents IA (`Accept: text/markdown`), enrobage `withMarkdown` du handler `fetch` (TanStack Start ne répond plus 406), et `@hgdc/agents/build` pour les sites prérendus (fichiers `.md` et routes Build Output API).
