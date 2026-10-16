# @hgdc/auth

## 0.8.0

### Minor Changes

- c970824: Événements d'organisation poussés par Account (`@hgdc/auth/events`, ADR 0014) : `signAccountEvent` côté Account, `verifyAccountEvent` et `handleAccountEventRequest` côté produit (HMAC-SHA256 en Web Crypto, identifiant d'événement dans le MAC, fenêtre de 5 minutes, corps plafonné), schéma `accountEventSchema` (`member.removed`, `member.role_changed`, `organization.deleted`), `accountEventIsStale`. Pour Convex, `vAccountEvent` et `accountEventsTable` (événements déjà traités, pour l'idempotence).

## 0.7.1

### Patch Changes

- 44b5331: `useOrganizationRefresh(unknown)` (`@hgdc/auth/react`) : sur une page d'organisation inconnue du produit, part une fois vers `/auth/hgdc?refresh=1` et rend `true` le temps de la redirection ; au retour (`synced=1`), rend `false` pour afficher « introuvable ».

## 0.7.0

### Minor Changes

- b270863: Entrée `/auth/hgdc?refresh=1` : relance la connexion HGDC même avec une session produit ouverte, pour relire le claim `organizations` (une organisation rejointe dans Account apparaît sans attendre la session suivante, ADR 0013). Retour vers `next?synced=1`, sans boucle. Nouveaux : `HGDC_ENTRY_REFRESH_PARAM`, `HGDC_SYNCED_PARAM`, `hgdcRefreshPath`, `hasSyncedMarker`, `withSyncedMarker`, `withoutSyncedMarker`, et `hgdcEntryUrl(origin, next, { refresh: true })`.

## 0.6.2

### Patch Changes

- b3c09d4: README : mise en place des clés JWKS statiques en deux temps (Convex refuse un push dont la config lit une variable absente).

## 0.6.1

### Patch Changes

- 3d260ac: README : clés JWKS statiques côté Convex, pour que la vérification du jeton ne refasse pas une requête à chaque appel HTTP.

## 0.6.0

### Minor Changes

- 2374fd7: `HgdcMark` (and so `HgdcSignInButton`) shows the H family tricolour H instead of the old monogram; its SVG is exported as `HGDC_MARK_SVG`.
  
  The default label of `HgdcSignInButton` becomes "Se connecter avec H family" ("Redirection vers Account…" while pending).

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
