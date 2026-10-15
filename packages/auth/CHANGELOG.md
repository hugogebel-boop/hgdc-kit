# @hgdc/auth

## 0.5.0

### Minor Changes

- 18ed48e: Entrée commune des produits. `@hgdc/auth/server` : `createHgdcEntry`, route serveur `GET /auth/hgdc?next=<chemin>` qui ouvre le produit avec la session HGDC Account (redirection vers `next` si la session du produit existe, sinon connexion HGDC lancée aussitôt, sans page d'accueil ni bouton). `@hgdc/auth` : `HGDC_ENTRY_PATH`, `safeNextPath` (chemin du produit seulement, pas de redirection ouverte) et `hgdcEntryUrl`. `@hgdc/ui/products` : `entryHref` dans le catalogue et `PRODUCT_ENTRY_PATH` ; `productMenuEntries` pointe chaque produit vers son entrée, Account reste sa racine. Chaque produit doit monter la route avant d'adopter cette version de `@hgdc/ui`.

## 0.4.0

### Minor Changes

- 49ea4ec: Reprend de Host la vérification et la fraîcheur des organisations. `verifiedOrganizationsFromIdToken(idToken, { issuer, clientId, now })` et `verifyHgdcIdToken` contrôlent l'émetteur, l'audience (et `azp`), un `iat` de moins de 10 minutes et `exp` avant de recopier les organisations ; refus en `HgdcIdTokenError` avec sa `reason`. `membershipIsFresh`, `SESSION_TTL_SECONDS`, `MEMBERSHIP_TTL_MS` et `KEY_MEMBERSHIP_TTL_MS` portent le modèle recommandé (synchronisation dans `session.create.before`, sessions de 7 jours sans prolongation, appartenance périmée sans accès). Les refus des gardes portent `reason` (`no_session`, `wrong_issuer`, `not_member`, `insufficient_role`) en plus de `code`, lisible par `authErrorReason` ; leurs messages passent au tutoiement (« Connecte-toi pour continuer. »). Aucune API ne change ; un test qui compare l'ancien texte d'un refus est à passer sur `reason`.

## 0.3.0

### Minor Changes

- 3f52deb: `organizationsFromIdToken` lit les organisations d'un id_token de HGDC Account et `planOrganizationSync` calcule ce qu'un produit doit écrire pour garder sa copie à jour à chaque connexion.

## 0.2.0

### Minor Changes

- b0ff781: Premier contenu de `@hgdc/auth` : bouton « Se connecter avec HGDC » (`@hgdc/auth/react`), fournisseur `hgdc` pour `genericOAuth` et proxy `/api/auth` vers Convex (`@hgdc/auth/server`), gardes Convex `requireIdentity` et `requireOrgMember` (`@hgdc/auth/convex`), rôles et validation du profil OIDC.

## 0.1.1

### Patch Changes

- 492a6be: Liens vers la documentation et le signalement de faille sur la page npm de chaque paquet. Première version publiée par la CI, avec provenance.
