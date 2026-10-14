# hgdc-kit

Code commun de la H family, publié sur npm (`@hgdc/*`). Vue d'ensemble : `README.md`, décisions : `docs/adr/`.

- **Dépôt public** : rien de privé ici, ni secret, ni nom d'hôte interne, ni vision produit (elle vit dans le dépôt privé `hgdc`, `site/docs/vision.md`).
- `packages/config/stack.json` fait foi pour les versions de la stack. Les `devDependencies` du kit s'y conforment (`bun run stack`). Un paquet ajouté à la stack l'est aussi dans `renovate/default.json` (le test `renovate.test.ts` le vérifie).
- Un paquet publié ne doit jamais casser un produit : toute modification d'un preset se teste d'abord sur `host` (`bun pm pack`, puis installer le `.tgz` dans host et lancer son `check`).
- Le code publié est compilé (`dist/`, Node 22.18+) : oxlint charge `oxlint.config.ts` avec Node, qui ne retire pas les types dans `node_modules`.
- Toute modification d'un paquet publié s'accompagne d'un changeset (`bun changeset`). Jamais de CHANGELOG ni de version écrits à la main.
- Le nom du fichier `release.yml` est déclaré comme trusted publisher sur npm : le renommer casse la publication.
- changesets/action v2 : entrées et sorties en kebab-case (`publish-script`, `published-packages`). Une sortie mal nommée vaut une chaîne vide, sans erreur. Le jeton passe par l'entrée `github-token` (`HGDC_BOT_TOKEN`, pour que la PR de release ait sa CI), jamais par `env.GITHUB_TOKEN`.
- Avant de livrer : `bun run check`.
