# Le kit (`packages/`)

Code commun de la H Collection, publié sur npm (`@hgdc/*`). Vue d'ensemble : `README.md` de ce dossier, décisions : `../docs/adr/`. Règles du dépôt : `../CLAUDE.md`.

- **Copié dans le dépôt public `hgdc-kit`** : rien de privé dans `packages/`, ni secret, ni nom d'hôte interne, ni vision produit (elle vit dans le dépôt privé `hgdc`, `site/docs/vision.md`).
- `config/stack.json` fait foi pour les versions de la stack. Les `devDependencies` de la racine s'y conforment (`bun run stack`). Un paquet ajouté à la stack l'est aussi dans `config/renovate/default.json` (le test `renovate.test.ts` le vérifie).
- Un paquet publié ne doit jamais casser un produit : un module de `../modules/` le prend par `workspace:*`, son `check` passe dans la même PR. Pour un produit hors du dépôt (site, Agence, aide, Portal), tester le `.tgz` (`bun pm pack`, l'installer, lancer son `check`).
- Le code publié est compilé (`dist/`, Node 22.18+) : oxlint charge `oxlint.config.ts` avec Node, qui ne retire pas les types dans `node_modules`. Un module lit aussi `dist/` : `bun run build:kit` avant son check.
- Toute modification d'un paquet publié s'accompagne d'un changeset (`bun changeset`). Jamais de CHANGELOG ni de version écrits à la main.
- Les versions se montent dans `basalte` (PR « chore: release », `kit-version.yml`) ; la publication part de `hgdc-kit`, copie écrite par `kit-mirror.yml`. Son `release.yml` (source : `../kit-public/.github/workflows/release.yml`) est déclaré comme trusted publisher sur npm : ne jamais renommer ce fichier.
- changesets/action v2 : entrées et sorties en kebab-case (`publish-script`, `published-packages`). Une sortie mal nommée vaut une chaîne vide, sans erreur. Le jeton passe par l'entrée `github-token` (`HGDC_BOT_TOKEN`, pour que la PR de release ait sa CI), jamais par `env.GITHUB_TOKEN`.
- Un nouveau paquet n'est jamais publié par la CI (`publish.ts` le saute tant qu'il n'existe pas sur npm) : premier envoi par Hugo depuis le poste (`../docs/runbooks/publier.md`).
- Avant de livrer : `bun run check:kit` depuis la racine.
