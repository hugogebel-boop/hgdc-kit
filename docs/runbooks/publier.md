---
owner: Hugo Gebel
last_reviewed: 2026-10-14
---

# Publier une version

## Cas normal

1. Chaque PR qui touche un paquet ajoute un changeset (`bun changeset`).
2. Après fusion, `release.yml` ouvre ou met à jour la PR « chore: release » (versions, CHANGELOG).
3. Attendre la CI de cette PR, puis la fusionner (`gh pr merge <n> --squash`). Elle est ouverte avec `HGDC_BOT_TOKEN`, qui doit couvrir `hgdc-kit` lui-même (_Contents_ et _Pull requests_ en écriture) : ouverte avec le `GITHUB_TOKEN` de l'action, elle ne lancerait pas la CI, et la règle de `main` bloquerait la fusion. Ensuite : `release.yml` publie sur npm par OIDC, avec provenance, crée les tags et les releases GitHub, puis `propagate.yml` ouvre une PR dans chaque produit si `@hgdc/config` a changé.

Vérifier : `npm view @hgdc/config version` et le badge « Provenance » sur npmjs.com.

## Premier publish d'un nouveau paquet

npm ne déclare un _trusted publisher_ que sur un paquet qui existe déjà. La première version part donc du poste, sans provenance :

1. `npm login` (compte `smartflowdev`, membre de l'organisation `hgdc`), puis `bun run release` depuis `main` à jour. npm demande la confirmation 2FA dans le navigateur.
2. Pour chaque nouveau paquet : npmjs.com → paquet → _Settings_ → _Trusted Publisher_ → _GitHub Actions_ : utilisateur `hugogebel-boop`, dépôt `hgdc-kit`, workflow `release.yml`, environnement vide.
3. Même page, _Publishing access_ → « Require two-factor authentication and disallow tokens ».
4. `git push --tags` pour les tags créés par `changeset tag`.

Les versions suivantes passent par la CI, avec provenance.

## Incidents

- **`E404` ou `ENEEDAUTH` au publish** : trusted publisher mal déclaré (dépôt ou nom de fichier du workflow, sensibles à la casse) ou `repository.url` du `package.json` différent du dépôt.
- **PR de mise à jour non ouverte dans un produit** : secret `HGDC_BOT_TOKEN` absent ou expiré (source : Doppler `hgdc/prd`, à recopier avec `doppler secrets get HGDC_BOT_TOKEN --project hgdc --config prd --plain | gh secret set HGDC_BOT_TOKEN --repo hugogebel-boop/hgdc-kit`), jeton sans accès au dépôt, ou dépôt absent de `HGDC_PRODUCTS`. `No version matching` dans le log : le CDN de npm n'exposait pas encore la version, et les 5 minutes de réessais n'ont pas suffi. Corriger puis relancer : `gh workflow run propagate.yml --repo hugogebel-boop/hgdc-kit -f version=<version>`.
- **Version publiée cassée** : `npm deprecate @hgdc/<paquet>@<version> "<raison>"`, puis publier un correctif. Jamais `npm unpublish`.
