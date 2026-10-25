---
owner: Hugo Gebel
last_reviewed: 2026-10-25
---

# Publier une version

## Cas normal

1. Chaque PR qui touche un paquet ajoute un changeset (`bun changeset`).
2. Après fusion, `release.yml` ouvre ou met à jour la PR « chore: release » (versions, CHANGELOG).
3. Attendre la CI de cette PR, puis la fusionner (`gh pr merge <n> --squash`). Elle est ouverte avec `HGDC_BOT_TOKEN`, qui doit couvrir `hgdc-kit` lui-même (_Contents_ et _Pull requests_ en écriture) : ouverte avec le `GITHUB_TOKEN` de l'action, elle ne lancerait pas la CI, et la règle de `main` bloquerait la fusion. Ensuite : `release.yml` publie sur npm par OIDC, avec provenance, crée les tags et les releases GitHub, puis `propagate.yml` ouvre une seule PR par dépôt si `@hgdc/config` ou `@hgdc/ui` a changé : `@hgdc/config` dans les produits (`HGDC_PRODUCTS`), `@hgdc/ui` dans les produits et le site hgdc.ch (`HGDC_UI_REPOS`). Fusion automatique quand la CI passe ; le site, sans fusion automatique, est fusionné par le workflow une fois son check « HGDC Host » vert.

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

`@hgdc/agents` 0.1.0 à 0.4.0 (2026-10-24) puis 0.5.0 et 0.6.0 (2026-10-25) : publiés depuis le poste par la voie du jeton ci-dessous, après la fusion de leur PR « chore: release ». **Trusted publisher à déclarer par Hugo** (`hugogebel-boop` / `hgdc-kit` / `release.yml`) : d'ici là, `release.yml` échoue sur `@hgdc/agents` (`E404` au `PUT`) et chaque version part du poste de la même façon.

`@hgdc/status` 0.1.0 : publié le 2026-10-23 depuis le poste par la voie du jeton ci-dessous (le premier essai par `npm login` avait échoué sur le code 2FA, et serait parti en `0.0.0` : publier seulement depuis `main` après la release). Trusted publisher déclaré par Hugo le 2026-10-23 (`hugogebel-boop` / `hgdc-kit` / `release.yml`) : les versions suivantes passent par la CI, avec provenance.

`@hgdc/assistant` 0.1.0 : publié le 2026-10-18 depuis le poste par la voie du jeton ci-dessous ; trusted publisher déclaré ensuite sur npmjs.com (`hugogebel-boop` / `hgdc-kit` / `release.yml`). Les versions suivantes passent par la CI, avec provenance.

### Cas général

`npm login`, puis `bun run release` depuis `main` à jour, `git push --tags`, et les deux réglages ci-dessus pour le nouveau paquet. Les versions suivantes passent par la CI, avec provenance.

Sans session npm (voie retenue le 2026-10-15, premier envoi de `@hgdc/domains`) : le jeton d'automatisation Doppler `hgdc/prd` `NPM_PUBLISH_TOKEN` (compte `smartflowdev`, sans 2FA), écrit dans un `.npmrc` temporaire, jamais affiché, effacé aussitôt :

```sh
umask 077 && rc="$(mktemp)"   && printf '//registry.npmjs.org/:_authToken=%s
' "$(doppler secrets get NPM_PUBLISH_TOKEN --project hgdc --config prd --plain)" > "$rc"   && NPM_CONFIG_USERCONFIG="$rc" bun run release; trash "$rc"; git push --tags
```

`npm view @hgdc/<paquet> version` peut rendre `E404` quelques minutes après la publication (CDN de npm) : attendre.

## Incidents

- **`E404` ou `ENEEDAUTH` au publish** : trusted publisher mal déclaré (dépôt ou nom de fichier du workflow, sensibles à la casse) ou `repository.url` du `package.json` différent du dépôt.
- **PR de mise à jour non ouverte dans un produit** : secret `HGDC_BOT_TOKEN` absent ou expiré (source : Doppler `hgdc/prd`, à recopier avec `doppler secrets get HGDC_BOT_TOKEN --project hgdc --config prd --plain | gh secret set HGDC_BOT_TOKEN --repo hugogebel-boop/hgdc-kit`), jeton sans accès au dépôt, ou dépôt absent de `HGDC_PRODUCTS` / `HGDC_UI_REPOS`. `No version matching` dans le log : le CDN de npm n'exposait pas encore la version, et les 15 minutes de réessais (20 × 45 s, hgdc-kit#128) n'ont pas suffi. Corriger puis relancer : `gh workflow run propagate.yml --repo hugogebel-boop/hgdc-kit -f config=<version> -f ui=<version>` (laisser vide la version qui ne change pas).
- **Version publiée cassée** : `npm deprecate @hgdc/<paquet>@<version> "<raison>"`, puis publier un correctif. Jamais `npm unpublish`.
