---
owner: Hugo Gebel
last_reviewed: 2026-10-14
status: accepted
---

# 0002. Versions de la stack imposées par `@hgdc/config`

## Contexte

Host et Mail divergeaient (`react` 19.3.0 contre `^19.2.5`, `convex-helpers`, `oxlint`…). Les produits doivent partager des versions exactes, et une mise à jour du kit doit atteindre chaque produit sans passer à la main dans chacun.

## Décision

- `packages/config/stack.json` liste les versions exactes de la stack commune. `hgdc-stack check`, lancé par le `check` de chaque produit, échoue si une dépendance de cette liste n'est pas épinglée à sa version. `hgdc-stack sync` réécrit le `package.json`.
- Dans le kit, Renovate met à jour `stack.json` (gestionnaire `jsonata`) et les dépendances du kit dans une seule PR « stack HGDC ».
- Après chaque publication de `@hgdc/config`, le workflow `propagate.yml` (appelé par `release.yml`, relançable à la main) ouvre dans chaque produit une PR qui passe à la nouvelle version, lance `hgdc-stack sync` et `bun install`, puis active la fusion automatique.
- Dans les produits, le preset Renovate du kit désactive `@hgdc/*` et les paquets de la stack, et garde le reste (mineurs et correctifs fusionnés si la CI passe, délai de 3 jours après publication).

## Conséquences

- Une version de la stack se décide à un seul endroit et se valide d'abord dans la CI du kit.
- La propagation demande un jeton GitHub fin (`HGDC_BOT_TOKEN`, contenu et PR en écriture sur les produits).
- La liste des paquets désactivés dans le preset doit suivre `stack.json` : un test du kit le vérifie.

## Options écartées

- **Renovate seul dans les produits** : l'application hébergée ne peut pas lancer `hgdc-stack sync` (`postUpgradeTasks` réservé à l'auto-hébergement), la PR de `@hgdc/config` échouerait jusqu'à une correction à la main.
- **`peerDependencies` exactes** : un avertissement d'installation, pas une garantie.
