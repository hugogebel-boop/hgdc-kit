---
owner: Hugo Gebel
last_reviewed: 2026-10-14
status: accepted
---

# 0001. Kit public sur npm, scope `@hgdc`

## Contexte

Le cadre initial prévoyait des paquets privés sur GitHub Packages. Deux contraintes l'ont fait tomber :

- GitHub Packages impose que le scope npm soit le nom du compte propriétaire. L'organisation GitHub `hgdc` appartient à un tiers : `@hgdc/*` y est impossible.
- Un paquet privé exige un jeton _classic_ `read:packages` (les jetons fins ne sont pas acceptés) dans chaque projet Vercel, chaque dépôt, Renovate et chaque poste. De plus, un workflow réutilisable d'un dépôt privé n'est appelable que depuis un dépôt du même propriétaire.

## Décision

Dépôt `hugogebel-boop/hgdc-kit` public, paquets `@hgdc/config`, `@hgdc/ui`, `@hgdc/auth` publics sur npmjs.com (organisation npm `hgdc`), sous licence « tous droits réservés » (`UNLICENSED`). Publication par la CI seule, en _trusted publishing_ (OIDC) avec provenance signée.

## Conséquences

- Aucun jeton pour installer le kit, nulle part. Les workflows et le preset Renovate se référencent depuis n'importe quel dépôt.
- Le code du kit est lisible par tous. Il ne contient que de la configuration, des composants d'interface et des gardes d'auth dont la sûreté ne dépend pas du secret du code. `gitleaks` tourne en CI.
- La vision de la famille et l'infrastructure ne vivent pas dans ce dépôt : elles restent dans les dépôts privés.
- Le premier publish de chaque paquet part du poste, sans provenance ; les suivants passent par la CI ([runbook](../runbooks/publier.md)).

## Options écartées

- **Privé, `@hgdc-ch/*` sur une organisation GitHub dédiée** : jetons à distribuer partout et transfert des produits dans l'organisation.
- **Privé, `@hugogebel-boop/*`** : mêmes jetons, et la marque disparaît des imports.
