# @hgdc/agents

## 0.1.1

### Patch Changes

- 400a32e: `htmlToMarkdown` ignore les éléments de classe Tailwind `hidden` (moitié sombre d'un logo clair et sombre), comme `visually-hidden`.

## 0.1.0

### Minor Changes

- 3b1f0a3: Nouveau paquet : version Markdown des pages pour les agents IA (`Accept: text/markdown`), enrobage `withMarkdown` du handler `fetch` (TanStack Start ne répond plus 406), et `@hgdc/agents/build` pour les sites prérendus (fichiers `.md` et routes Build Output API).
