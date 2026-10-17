---
owner: Hugo Gebel
last_reviewed: 2026-10-17
status: accepted
---

# 0004. `@hgdc/auth` : client OIDC générique, proxy maison, gardes à chargeur injecté

## Contexte

HGDC Account est le fournisseur OIDC de la famille. Chaque produit (better-auth, Convex, TanStack Start) doit s'y connecter de la même façon et protéger ses fonctions par organisation, sans lire la base d'Account.

## Décision

- **Client** : `hgdcProvider` rend une entrée du plugin `genericOAuth` de better-auth (découverte OIDC, PKCE, vérification de l'émetteur, profil validé par Zod). Pas de plugin better-auth maison : moins de surface, et `genericOAuth` suit les versions de better-auth.
- **Pairs facultatifs** : better-auth, convex et React ne sont exigés que par l'import qui les utilise (`/server`, `/convex`, `/react`). better-auth est borné à `<1.7.0` : l'adaptateur Convex ne supporte pas encore 1.7, et `genericOAuth` change en 1.7.
- **Proxy `/api/auth`** (`createAuthProxy` + `restoreFetchMode`) plutôt que celui de `@convex-dev/better-auth` 0.12 : celui-ci transmet le corps en flux (undici échoue sur une réponse 401, le client reçoit un 500), et le `fetch` de Node impose `sec-fetch-mode: cors`, ce qui fait rendre du JSON à better-auth au lieu d'une redirection. Le mode d'origine voyage dans `x-hgdc-fetch-mode` et est restauré côté Convex.
- **Gardes** : `requireOrgMember` prend un chargeur d'appartenance injecté. Account lit les tables du plugin `organization` ; un produit lit sa copie synchronisée depuis les claims. La garde exige l'émetteur attendu (un `subject` n'est unique que chez son émetteur, constat de la revue adversariale) et vérifie que l'appartenance rendue concerne bien la personne et l'organisation demandées.

- **Refus typés (0.4)** : la `ConvexError` des gardes porte `reason` (`no_session`, `wrong_issuer`, `not_member`, `insufficient_role`) en plus de `code`. Mail distinguait un rôle insuffisant en cherchant « rôle » dans le message : le texte peut changer, `reason` non. Les messages passent au tutoiement, comme toute l'interface de la famille.
- **Vérification de l'id_token à la connexion (0.4)**, reprise de Host : `verifyHgdcIdToken` contrôle `iss`, `aud` (et `azp` s'il y a plusieurs audiences), `iat` de moins de 10 minutes (une minute d'avance tolérée) et `exp`. Pas de vérification de signature (OIDC Core 3.1.3.7, point 6 : jeton reçu du point de jeton en TLS) ; sans contrôle de fraîcheur, un id_token resté dans la table `account` pourrait rejouer d'anciennes organisations. `now` est en millisecondes : passé en secondes, le jeton paraît venir du futur et il est refusé, pas accepté.
- **Fraîcheur des appartenances (0.4)**, reprise de Host : sessions de 7 jours sans prolongation (`SESSION_TTL_SECONDS`), copie valable 8 jours (`MEMBERSHIP_TTL_MS`), 30 jours pour la créatrice d'une clé d'API (`KEY_MEMBERSHIP_TTL_MS`), fonction pure `membershipIsFresh`. C'est la réponse, en attendant une synchronisation poussée, au retrait d'une personne dans Account : elle perd l'accès en 8 jours au plus.
- **Changement de domaine du déploiement Convex (0.12)** : la garde accepte une liste d'émetteurs, construite par `convexIssuers` à partir de `CONVEX_SITE_URL` et de `CONVEX_PREVIOUS_SITE_URL`, et `convexAuthProviders` double le fournisseur de `auth.config.ts` le temps de la bascule. Sans cette fenêtre, les jetons émis avant la bascule sont refusés jusqu'à leur expiration (15 minutes). La liste ne porte que des adresses du même émetteur : même clé, mêmes `subject`. Convex refuse un push dont `auth.config.ts` lit une variable absente et n'y énumère pas `process.env` : la variable facultative se lit directement, dans un `try`.

## Conséquences

- Les produits qui utilisent encore le `handler` de `@convex-dev/better-auth` (Host, Mail) ont les deux défauts du proxy : à migrer avec leur passage à Account.
- Un rôle changé dans Account n'arrive dans un produit qu'à la reconnexion, au plus 7 jours plus tard ; un retrait coupe l'accès en 8 jours au plus. La synchronisation poussée reste à concevoir.
- Host garde ses copies (`verifiedClaims`, `membershipIsFresh`) jusqu'à ce qu'il passe aux fonctions du kit ; Mail et les produits suivants partent du kit. Un test qui compare le texte d'un refus (« Connectez-vous… ») est à passer sur `reason`.
