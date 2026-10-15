---
owner: Hugo Gebel
last_reviewed: 2026-10-15
---

# Publier une version

## Cas normal

1. Chaque PR qui touche un paquet ajoute un changeset (`bun changeset`).
2. Après fusion, `release.yml` ouvre ou met à jour la PR « chore: release » (versions, CHANGELOG).
3. Attendre la CI de cette PR, puis la fusionner (`gh pr merge <n> --squash`). Elle est ouverte avec `HGDC_BOT_TOKEN`, qui doit couvrir `hgdc-kit` lui-même (_Contents_ et _Pull requests_ en écriture) : ouverte avec le `GITHUB_TOKEN` de l'action, elle ne lancerait pas la CI, et la règle de `main` bloquerait la fusion. Ensuite : `release.yml` publie sur npm par OIDC, avec provenance, crée les tags et les releases GitHub, puis `propagate.yml` ouvre une PR dans chaque produit si `@hgdc/config` a changé.

Vérifier : `npm view @hgdc/config version` et le badge « Provenance » sur npmjs.com.

## Premier publish d'un nouveau paquet

npm ne déclare un _trusted publisher_ que sur un paquet qui existe déjà. En CI, `scripts/publish.ts` saute donc tout paquet absent de npm (avertissement « Premier envoi manuel » dans le journal de `release.yml`) : la release des autres paquets passe, et la première version part du poste, sans provenance.

### En attente : `@hgdc/errors` et `@hgdc/docs`

`@hgdc/errors` vit ici ; `@hgdc/docs` dans le dépôt privé `hgdc-docs` (`packages/site`). Les deux partent en une fois, avec la même session npm. Prérequis : la PR « chore: release » qui porte `@hgdc/errors` 0.1.0 est fusionnée, les deux dépôts sont clonés côte à côte (`kit/` et `docs/`).

```sh
cd kit && git switch main && git pull && git -C ../docs switch main && git -C ../docs pull \
  && (npm whoami || npm login) \
  && bun install --frozen-lockfile && bun run release && git push --tags \
  && (cd ../docs/packages/site && npm publish --access public) \
  && npm view @hgdc/errors version && npm view @hgdc/docs version
```

- `npm login` : compte `smartflowdev`, membre de l'organisation `hgdc`. npm demande la confirmation 2FA dans le navigateur à chaque publication.
- `bun run release` construit le kit et publie ce qui manque sur npm (ici `@hgdc/errors` seul), puis crée son tag ; `git push --tags` le pousse.
- `@hgdc/docs` part sans provenance tant que `hgdc-docs` est privé.

Puis, sur npmjs.com, pour chacun :

1. Paquet → _Settings_ → _Trusted Publisher_ → _GitHub Actions_ :
   - `@hgdc/errors` : utilisateur `hugogebel-boop`, dépôt `hgdc-kit`, workflow `release.yml`, environnement vide.
   - `@hgdc/docs` : utilisateur `hugogebel-boop`, dépôt `hgdc-docs`, workflow `release.yml` (à créer dans `hgdc-docs` sur le modèle de celui du kit ; d'ici là, les versions suivantes partent du poste comme la première).
2. Même page, _Publishing access_ → « Require two-factor authentication and disallow tokens ».

### Cas général

`npm login`, puis `bun run release` depuis `main` à jour, `git push --tags`, et les deux réglages ci-dessus pour le nouveau paquet. Les versions suivantes passent par la CI, avec provenance.

## Incidents

- **`E404` ou `ENEEDAUTH` au publish** : trusted publisher mal déclaré (dépôt ou nom de fichier du workflow, sensibles à la casse) ou `repository.url` du `package.json` différent du dépôt.
- **PR de mise à jour non ouverte dans un produit** : secret `HGDC_BOT_TOKEN` absent ou expiré (source : Doppler `hgdc/prd`, à recopier avec `doppler secrets get HGDC_BOT_TOKEN --project hgdc --config prd --plain | gh secret set HGDC_BOT_TOKEN --repo hugogebel-boop/hgdc-kit`), jeton sans accès au dépôt, ou dépôt absent de `HGDC_PRODUCTS`. `No version matching` dans le log : le CDN de npm n'exposait pas encore la version, et les 5 minutes de réessais n'ont pas suffi. Corriger puis relancer : `gh workflow run propagate.yml --repo hugogebel-boop/hgdc-kit -f version=<version>`.
- **Version publiée cassée** : `npm deprecate @hgdc/<paquet>@<version> "<raison>"`, puis publier un correctif. Jamais `npm unpublish`.
