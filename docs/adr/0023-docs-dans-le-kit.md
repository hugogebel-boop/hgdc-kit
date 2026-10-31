---
owner: Hugo Gebel
last_reviewed: 2026-10-31
status: accepted
---

# 0023. `@hgdc/docs` dans le kit, pages d'API générées

## Contexte

`@hgdc/docs` (modèle de site Astro Starlight, commande `hgdc-docs`) vivait dans `packages/site` du dépôt privé `hgdc-docs`. Il est pourtant installé par tous les sites de documentation, ceux de la H Collection (`hgdc-aide`) comme ceux des clients, et il n'avait ni la release par changesets ni la publication signée des autres paquets du kit. Il n'avait aussi aucune référence d'API : les pages d'API de l'aide s'écrivaient à la main et se désynchronisaient de la spécification OpenAPI que publie chaque produit.

## Décision

- Le paquet vit dans `packages/docs` du kit, sous le même nom. Son historique reste dans `hgdc-docs` (avant la fusion de cette PR) : le déplacement copie les fichiers, sans réécrire l'historique.
- Il reste publié en TypeScript source (`src/`), comme avant : Astro, Vite et Convex le compilent, les consoles importent `@hgdc/docs/core/*`. Seul `@hgdc/docs/openapi` est compilé (`dist/`), parce qu'il sert aussi à des scripts Node simples qui ne retirent pas les types d'un fichier de `node_modules`.
- La mécanique de l'aperçu de la console (`src/preview/`) part avec le paquet : elle est inséparable du pont et du rechargement à chaud de l'intégration. L'image du service d'aperçu, privée, la tire du tarball publié (`npm pack`).
- `example/` (une petite doc complète) vient avec le paquet : `bun run build` la construit, ce qui vérifie que le paquet s'installe et s'assemble comme chez un client.
- Pages de référence : `openApiPages(spec)` produit une page MDX par groupe (tag, sinon premier segment du chemin) avec, par route, paramètres, corps, réponses, exemple `curl`. La sortie est déterministe, donc vérifiable en CI par comparaison.

## Pourquoi pas `starlight-openapi`

C'est le plugin le plus maintenu (0.27.0, Astro 7 et Starlight 0.41+). Il a été écarté, sans nouvelle dépendance à auditer :

- Il rend les routes à la construction, hors du contenu MDX : la recherche du site, `llms.txt`, la version Markdown des pages et le corpus de l'assistant de Docs, qui indexent les pages listées dans `docs.json`, ne les verraient pas. Or lire l'API est le cas d'usage principal d'un agent.
- Il ajoute `httpsnippet`, `@readme/openapi-parser`, `url-template` et un pair `@astrojs/markdown-satteri`, pour un rendu en anglais et une barre latérale propre qui ne suit pas le `docs.json` de Mintlify.
- Les pages MDX générées s'écrivent dans le dépôt de la doc : elles se relisent dans une PR et chaque produit peut les compléter autour.

## Conséquences

- `hgdc-docs` et `hgdc-aide` dépendent de `@hgdc/docs` publié sur npm, plus d'un espace de travail local. Un changement de `core/` se publie d'abord dans le kit.
- Premier envoi depuis le poste, puis déclaration du trusted publisher sur npm (`hugogebel-boop` / `hgdc-kit` / `release.yml`) : voir le [runbook](../runbooks/publier.md).
