---
owner: Hugo Gebel
last_reviewed: 2026-11-12
---

# Publier une version

Deux dépôts (ADR 0021 de `site/`) : `basalte` (privé) est la source du kit et monte les versions ; `hgdc-kit` (public) en est la copie, écrite par la CI de `basalte` seulement, et publie sur npm. Les modules de `basalte` prennent le kit par `workspace:*` : ils n'attendent jamais une publication.

## Cas normal

1. Chaque PR de `basalte` qui touche un paquet ajoute un changeset (`bun changeset`).
2. Après fusion, `kit-version.yml` (`basalte`) ouvre ou met à jour la PR « chore: release » (versions, CHANGELOG, `packages/config/stack.json`). Elle est ouverte avec `HGDC_BOT_TOKEN`, qui doit couvrir `basalte` (_Contents_ et _Pull requests_ en écriture) : ouverte avec le `GITHUB_TOKEN` de l'action, elle ne lancerait pas la CI.
3. Attendre la CI de cette PR, puis la fusionner (`gh pr merge <n> --squash --repo hugogebel-boop/basalte`).
4. `kit-mirror.yml` (`basalte`) reconstruit l'arbre public (liste blanche de `scripts/kit-mirror.ts`, fichiers de `kit-public/`, `package.json` et `bun.lock` réduits au kit), le passe à gitleaks, puis le pousse en un commit sur `main` de `hgdc-kit` (ligne `Basalte-Commit: <sha>`). Chaque push de `main` qui touche l'arbre public est copié, même sans nouvelle version.
5. Dans `hgdc-kit`, `release.yml` vérifie le commit (`check`, origine de la copie, aucun changeset en attente), publie sur npm par OIDC, avec provenance, ce qui n'y est pas encore (`scripts/publish.ts` saute toute version déjà publiée), crée les tags et les releases GitHub, puis `propagate.yml` ouvre une seule PR par dépôt si `@hgdc/config` ou `@hgdc/ui` a changé : `@hgdc/config` dans les produits (`HGDC_PRODUCTS`), `@hgdc/ui` dans les produits et le site hgdc.ch (`HGDC_UI_REPOS`). Fusion automatique quand la CI passe ; le site, sans fusion automatique, est fusionné par le workflow une fois son check « HGDC Host » vert.

Vérifier : `npm view @hgdc/config version` et le badge « Provenance » sur npmjs.com.

Voir ce que la copie enverrait, depuis `basalte` : `npx -y bun@1.3.10 scripts/kit-mirror.ts <dossier vide>`. Relancer une copie : `gh workflow run kit-mirror.yml --repo hugogebel-boop/basalte`.

## Bascule vers la copie

**Faite le 2026-11-13** (première publication par la copie : `@hgdc/config` 0.7.0 et `@hgdc/api` 0.3.0, avec provenance). La suite reste comme mode d'emploi d'un retour arrière ou d'une nouvelle bascule. Une fois, dans cet ordre. Avant le dernier geste, rien ne tourne : `kit-mirror.yml` et `kit-version.yml` attendent `KIT_MIRROR=on`.

**Gestes d'activation** (**[Hugo]** : lui seul peut le faire ; les autres se lancent depuis le poste, avec `gh`) :

1. Geler `hgdc-kit` et fusionner les deux PR (étapes 1 et 2 ci-dessous).
2. **[Hugo] github.com** : ajouter `basalte` aux dépôts du jeton `HGDC_BOT_TOKEN` (_Contents_ et _Pull requests_ en écriture).
3. Environnements, secrets et clé de la copie (étape 3).
4. **[Hugo] npmjs.com, bloquant** : dans le _Trusted Publisher_ de **chaque** paquet `@hgdc/*`, renseigner l'environnement `npm` (utilisateur `hugogebel-boop`, dépôt `hgdc-kit`, workflow `release.yml`). Sans lui, `release.yml` (job dans l'environnement `npm`) ne publie plus. Tant qu'il manque, ne pas aller plus loin. En ligne de commande (npm 12, `npm login` puis 2FA confirmée dans le navigateur, depuis un vrai terminal) : `npm trust list <paquet>`, `npm trust revoke <paquet> --id=<id>` pour l'ancienne déclaration, puis `npm trust github <paquet> --repo hugogebel-boop/hgdc-kit --file release.yml --env npm --allow-publish`. Fait pour les onze paquets le 2026-11-13.
5. Règles de `hgdc-kit` (étape 4).
6. `KIT_MIRROR=on` et première copie (étape 5).

Détail :

1. Geler `hgdc-kit` : plus de fusion. Dans `basalte`, `git fetch kit && git merge kit/main` si `kit/main` a des commits absents (`git log origin/main..kit/main`). Aucune PR « chore: release » ni changeset en attente dans `hgdc-kit`.
2. Fusionner la PR de `basalte` qui apporte la copie, puis la PR `feat/mirror-of-basalte` de `hgdc-kit` (son `release.yml` refuse tout commit qui ne vient pas de la copie : l'échec de son job `origin` à cette fusion est attendu).
3. Environnements réservés à `main`, secrets posés dedans, clé de la copie :

   ```sh
   # Un environnement par secret, chacun limité à la branche main.
   for target in basalte/kit-mirror basalte/kit-version hgdc-kit/npm; do
     repo="hugogebel-boop/${target%/*}"; env="${target#*/}"
     printf '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' \
       | gh api -X PUT "repos/$repo/environments/$env" --input -
     gh api -X POST "repos/$repo/environments/$env/deployment-branch-policies" -f name=main -f type=branch
   done

   ssh-keygen -t ed25519 -N "" -C "basalte kit-mirror" -f kit-mirror-key
   gh repo deploy-key add kit-mirror-key.pub --repo hugogebel-boop/hgdc-kit --title "basalte kit-mirror" --allow-write
   gh secret set KIT_MIRROR_KEY --repo hugogebel-boop/basalte --env kit-mirror < kit-mirror-key
   doppler secrets set KIT_MIRROR_KEY --project hgdc --config prd < kit-mirror-key
   trash kit-mirror-key kit-mirror-key.pub
   doppler secrets get HGDC_BOT_TOKEN --project hgdc --config prd --plain \
     | gh secret set HGDC_BOT_TOKEN --repo hugogebel-boop/basalte --env kit-version
   ```

4. Règles de `hgdc-kit`. L'exception vaut pour **toutes** les clés de déploiement : d'abord lister, et retirer toute autre clé en écriture (`gh repo deploy-key delete <id> -R hugogebel-boop/hgdc-kit`) :

   ```sh
   gh repo deploy-key list -R hugogebel-boop/hgdc-kit
   ```

   Puis toutes les branches (création, mise à jour, suppression, réécriture) : seule la clé de la copie écrit, plus personne à la main, ni PR, ni administrateur. Et tous les tags : ni déplacés ni supprimés, par personne. Leur création reste libre : `release.yml` les pousse avec le jeton de l'action, et sur un compte personnel GitHub refuse l'app GitHub Actions comme exception d'une règle (« must be part of the ruleset source or owner organization », essai du 2026-11-13). Un tag ne déclenche aucune publication : `release.yml` ne part que d'un push sur `main`.

   ```sh
   gh api -X PUT repos/hugogebel-boop/hgdc-kit/rulesets/25082022 --input - <<'EOF'
   {
     "name": "branches : copie seulement",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["~ALL"], "exclude": [] } },
     "rules": [{ "type": "creation" }, { "type": "update" }, { "type": "deletion" }, { "type": "non_fast_forward" }],
     "bypass_actors": [{ "actor_id": null, "actor_type": "DeployKey", "bypass_mode": "always" }]
   }
   EOF
   gh api -X POST repos/hugogebel-boop/hgdc-kit/rulesets --input - <<'EOF'
   {
     "name": "tags : ni déplacés ni supprimés",
     "target": "tag",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["~ALL"], "exclude": [] } },
     "rules": [{ "type": "update" }, { "type": "deletion" }],
     "bypass_actors": []
   }
   EOF
   ```

5. `gh variable set KIT_MIRROR --repo hugogebel-boop/basalte --body on`, puis `gh workflow run kit-mirror.yml --repo hugogebel-boop/basalte` : attendu « hgdc-kit est déjà à jour », ou un commit `chore(mirror)` dont le `release.yml` passe au vert. Puis `gh workflow run kit-version.yml --repo hugogebel-boop/basalte` ouvre la PR « chore: release » des changesets en attente. Enfin, retirer le dépôt distant `kit` des clones de `basalte` (`git remote remove kit`) : on n'y fusionne plus rien.

**Copie poussée, publication échouée** (npm indisponible, `E404`, check rouge) : relancer `release.yml` de `hgdc-kit` sur `main`, sans risque, puisque `publish.ts` saute les versions déjà publiées : `gh run rerun <id> --failed --repo hugogebel-boop/hgdc-kit`, ou `gh workflow run release.yml --repo hugogebel-boop/hgdc-kit --ref main`. Ne rien pousser à la main dans `hgdc-kit` : corriger dans `basalte`, la copie suivante repart.

**Retour arrière** : `gh variable set KIT_MIRROR --repo hugogebel-boop/basalte --body off` ; supprimer la règle des tags et remettre l'ancienne règle de `hgdc-kit` (nom « main protégée », `include` : `~DEFAULT_BRANCH`, `rules` : `deletion`, `non_fast_forward`, `required_status_checks` sur `check / check` et `secrets / gitleaks` ; `bypass_actors` : `{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}`) ; dans `hgdc-kit`, par PR, reprendre `.github/workflows/release.yml` et les scripts `changeset` et `version` de `package.json` du commit qui précède la fusion de `feat/mirror-of-basalte` (`git checkout <sha> -- .github/workflows/release.yml`, scripts recopiés à la main), sans toucher aux paquets. Tout ce qui a été copié est déjà dans `hgdc-kit` : aucun commit perdu ; le kit s'y modifie de nouveau et revient dans `basalte` par `git merge kit/main`.

## Premier publish d'un nouveau paquet

npm ne déclare un _trusted publisher_ que sur un paquet qui existe déjà. En CI, `scripts/publish.ts` saute donc tout paquet absent de npm (avertissement « Premier envoi manuel » dans le journal de `release.yml`) : la release des autres paquets passe, et la première version part du poste, sans provenance.

### Historique : `@hgdc/errors` et `@hgdc/docs`

`@hgdc/docs` vit maintenant dans le kit (`packages/docs`, ADR 0023) : la section ci-dessous ne vaut que pour l'histoire de ses premiers envois, ses versions suivantes passent par la release du kit. Son trusted publisher npm pointe encore sur `hgdc-docs` : à redéclarer sur `hgdc-kit` / `release.yml`, d'ici là chaque version part du poste par la voie du jeton ci-dessous.

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

`@hgdc/assistant` 0.1.0 : publié le 2026-10-18 depuis le poste par la voie du jeton ci-dessous ; trusted publisher déclaré ensuite sur npmjs.com (`hugogebel-boop` / `hgdc-kit` / `release.yml`). 0.2.0 : la CI a rendu `E404` (déclaration inopérante), publié le 2026-10-27 depuis le poste ; trusted publisher redéclaré le même jour. Les versions suivantes passent par la CI, avec provenance.

### Cas général

`npm login`, puis `bun run release` depuis `main` à jour, `git push --tags`, et les deux réglages ci-dessus pour le nouveau paquet. Les versions suivantes passent par la CI, avec provenance.

Sans session npm (voie retenue le 2026-10-15, premier envoi de `@hgdc/domains`) : un jeton d'automatisation rangé dans le coffre de secrets (Doppler `hgdc/prd` `NPM_PUBLISH_TOKEN`), écrit dans un `.npmrc` temporaire, jamais affiché, effacé aussitôt :

```sh
umask 077 && rc="$(mktemp)"   && printf '//registry.npmjs.org/:_authToken=%s
' "$(doppler secrets get NPM_PUBLISH_TOKEN --project hgdc --config prd --plain)" > "$rc"   && NPM_CONFIG_USERCONFIG="$rc" bun run release; trash "$rc"; git push --tags
```

`npm view @hgdc/<paquet> version` peut rendre `E404` quelques minutes après la publication (CDN de npm) : attendre.

## Incidents

- **`E404` ou `ENEEDAUTH` au publish** : trusted publisher mal déclaré (dépôt ou nom de fichier du workflow, sensibles à la casse) ou `repository.url` du `package.json` différent du dépôt.
- **PR de mise à jour non ouverte dans un produit** : secret `HGDC_BOT_TOKEN` absent ou expiré (source : Doppler `hgdc/prd`, à recopier avec `doppler secrets get HGDC_BOT_TOKEN --project hgdc --config prd --plain | gh secret set HGDC_BOT_TOKEN --repo hugogebel-boop/hgdc-kit`), jeton sans accès au dépôt, ou dépôt absent de `HGDC_PRODUCTS` / `HGDC_UI_REPOS`. `No version matching` dans le log : le CDN de npm n'exposait pas encore la version, et les 15 minutes de réessais (20 × 45 s, hgdc-kit#128) n'ont pas suffi. Corriger puis relancer : `gh workflow run propagate.yml --repo hugogebel-boop/hgdc-kit -f config=<version> -f ui=<version>` (laisser vide la version qui ne change pas).
- **Version publiée cassée** : `npm deprecate @hgdc/<paquet>@<version> "<raison>"`, puis publier un correctif. Jamais `npm unpublish`.
