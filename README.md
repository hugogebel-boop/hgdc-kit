---
owner: Hugo Gebel
last_reviewed: 2026-10-18
---

# hgdc-kit

Le code commun de la H Collection (HGDC Host, Mail, Account…), publié sur npm sous le scope `@hgdc`.

| Paquet                                  | Contenu                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`@hgdc/config`](packages/config)       | Presets tsconfig, oxlint et oxfmt, preset Renovate, versions exactes de la stack et la commande `hgdc-stack` qui les impose       |
| [`@hgdc/ui`](packages/ui)               | Jetons de la DA, thèmes, composants, coque des consoles et modèle des e-mails transactionnels (`@hgdc/ui/email`)                  |
| [`@hgdc/auth`](packages/auth)           | Bouton « Se connecter avec HGDC », client OIDC better-auth, proxy `/api/auth`, gardes Convex `requireOrgMember`                   |
| [`@hgdc/errors`](packages/errors)       | Remontée d'erreurs vers GlitchTip, nettoyée et non bloquante : Convex, navigateur, serveur Bun ou Node                            |
| [`@hgdc/domains`](packages/domains)     | Domaines personnalisés : nom saisi, racine ou sous-domaine, preuve TXT, réponses DNS, enregistrements à afficher                  |
| [`@hgdc/assistant`](packages/assistant) | Moteur de l’assistant IA : outils typés, boucle Claude en flux, tables et gardes Convex, crédits, clé scellée                     |
| [`@hgdc/webhooks`](packages/webhooks)   | Webhooks signés (Standard Webhooks) : signature et vérification, secret `whsec_`, garde SSRF des adresses, calendrier de reprises |

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
- [Ajouter l’assistant à un produit](docs/guides/ajouter-l-assistant.md)
- [Publier une version](docs/runbooks/publier.md)
- [Décisions (ADR)](docs/adr/)

La vision de la famille et l'infrastructure restent dans les dépôts privés de HGDC.
