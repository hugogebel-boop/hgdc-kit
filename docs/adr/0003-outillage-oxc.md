---
owner: Hugo Gebel
last_reviewed: 2026-10-14
status: accepted
---

# 0003. oxlint avec typage et oxfmt plutôt que ESLint et Prettier

## Contexte

Host et Mail utilisaient déjà oxlint (règles par défaut, sans configuration) et aucun formateur. La stack est en TypeScript 7.

## Décision

- **oxlint** avec l'analyse de types (`oxlint-tsgolint`, TypeScript 7 requis). Le preset bloque la catégorie `correctness` et une courte liste de règles à forte valeur : promesses oubliées, `any`, `import type`, hooks React, `jsx-key`. L'accessibilité suit le preset `recommended` de `eslint-plugin-jsx-a11y`. Pas d'avertissement : une règle qui ne bloque pas finit ignorée.
- **oxfmt** comme formateur : sortie compatible Prettier, tri des classes Tailwind intégré, même chaîne d'outils qu'oxlint. Style aligné sur le code existant : sans point-virgule, guillemets doubles, 120 colonnes.
- Configs en TypeScript (`oxlint.config.ts`, `oxfmt.config.ts`) qui importent les presets de `@hgdc/config` : c'est la seule façon pour oxlint d'étendre une config venue d'un paquet npm.

## Conséquences

- Lint et format en quelques centaines de millisecondes, une seule famille d'outils à suivre.
- oxfmt est en 0.x : version épinglée par la stack, montée de version relue dans la PR « stack HGDC ».
- `site/` (Astro) garde Prettier : oxfmt ne formate pas les fichiers `.astro`.
