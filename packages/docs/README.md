# @hgdc/docs

Modèle de site de Docs : une documentation MDX décrite par un `docs.json` (champs de Mintlify), construite avec Astro Starlight. Recherche, versions, `llms.txt`, assistant, composants (`Card`, `Tabs`, `ParamField`…).

```sh
npm install --save-dev @hgdc/docs
npx hgdc-docs dev     # site local
npx hgdc-docs build   # site statique dans dist/
```

## Pages de référence d'API

`hgdc-docs openapi <spec.json> <dossier>` écrit une page MDX par tag d'une spécification OpenAPI 3 : un titre par route, ses paramètres, son corps, ses réponses et un exemple `curl`. Le même code est exposé en fonction :

```js
import { openApiPages } from "@hgdc/docs/openapi"

const pages = openApiPages(spec, { titles: { Emails: "E-mails" } })
// [{ slug, title, description, mdx }]
```

La sortie est déterministe : relancer sur la même spécification ne change aucun octet. Les pages sont du MDX ordinaire, donc la recherche, `llms.txt` et l'assistant les lisent comme les autres. Ajouter chaque page à la navigation de `docs.json`.

## Dans ce dépôt

- `src/core/` : règles pures, partagées avec la console de Docs.
- `src/preview/` : mécanique de l'aperçu de la console.
- `example/` : une petite doc construite par `bun run build` ; son test de validation est `src/core/validate.test.ts`.
