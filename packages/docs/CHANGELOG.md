# @hgdc/docs

## 0.6.2

### Patch Changes

- 56bd580: Le widget de l'assistant vouvoie les visiteurs : messages d'erreur (`ASK_ERRORS`), invite et barre de question.

## 0.6.1

### Patch Changes

- 2f471b0: Pages de référence d'API : les champs de la réponse précèdent l'exemple, qui réunit la requête et la réponse.
- a77b6ea: Le paquet n'embarque plus `template/.astro` ni `template/.build` (sorties d'un build local, présentes quand `bun run build` précède la publication).

## 0.6.0

### Minor Changes

- 5b5f165: `@hgdc/docs` vit maintenant dans le kit (il était dans `packages/site` de hgdc-docs). Nouveau : `openApiPages` (`@hgdc/docs/openapi`) et la commande `hgdc-docs openapi <spec.json> <dossier>` génèrent une page MDX de référence par groupe d'une spécification OpenAPI 3 (paramètres, corps, réponses, exemple), lue comme une page écrite à la main par la recherche, `llms.txt` et l'assistant.
