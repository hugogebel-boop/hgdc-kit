---
owner: Hugo Gebel
last_reviewed: 2026-10-14
---

# hgdc-kit

Le code commun de la H family (HGDC Host, Mail, Account…), publié sur npm sous le scope `@hgdc`.

| Paquet                            | Contenu                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`@hgdc/config`](packages/config) | Presets tsconfig, oxlint et oxfmt, preset Renovate, versions exactes de la stack et la commande `hgdc-stack` qui les impose |
| [`@hgdc/ui`](packages/ui)         | Jetons de la DA, thèmes clair et sombre, polices et composants de base (Base UI, Tailwind v4)                               |
| [`@hgdc/auth`](packages/auth)     | Bouton « Se connecter avec HGDC », client OIDC better-auth, proxy `/api/auth`, gardes Convex `requireOrgMember`             |

Le dépôt est public pour que chaque produit installe le kit sans jeton. Ce n'est pas du logiciel libre : tous droits réservés ([LICENSE](LICENSE)).

## Démarrer

```sh
bun install
bun run check   # stack, format, typecheck, lint, tests, build
```

Bun 1.3 et Node 24.

## Modifier un paquet

1. Branche `feat/…` ou `fix/…`, modification, `bun run check`.
2. `bun changeset` : paquets touchés, niveau (patch, minor, major), une phrase pour le CHANGELOG.
3. PR sur `main`. Une fois fusionnée, la PR « chore: release » regroupe les changesets ; sa fusion, une fois sa CI verte ([runbook](docs/runbooks/publier.md)), publie sur npm et ouvre dans chaque produit une PR de mise à jour, fusionnée seule si sa CI passe.

## Documentation

- [Adopter le kit dans un produit](docs/guides/adopter-le-kit.md)
- [Publier une version](docs/runbooks/publier.md)
- [Décisions (ADR)](docs/adr/)

La vision de la famille et l'infrastructure restent dans les dépôts privés de HGDC.
