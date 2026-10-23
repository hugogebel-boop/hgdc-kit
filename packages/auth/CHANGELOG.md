# @hgdc/auth

## 0.17.1

### Patch Changes

- 2ff60ed: Passage d'un produit à l'autre sous `app.hgdc.ch/<produit>` comme dans une seule app (ADR 0020).
  
  - `@hgdc/ui/styles.css` : transitions de vue entre documents (`@view-transition`, même origine). La barre des produits, la barre latérale et la barre du haut restent en place, le contenu passe en fondu de 150 ms. Mouvement réduit : aucune transition.
  - Barre des produits : un produit servi sous la même origine que la page reçoit un lien relatif marqué `data-hgdc-prerender`, prérendu au survol (`PRODUCT_SPECULATION_RULES`, `eagerness: "moderate"`). Les produits encore sur leur sous-domaine restent préchargés comme avant. Le produit courant pointe vers sa base (`/mail/`), plus vers `/`.
  - Une page prérendue attend d'être affichée pour relire les organisations. Le cookie de relecture porte la base du produit et le cadre s'ouvre sous elle (`takeOrgSync`).
  - Le H du départ vers un autre produit apparaît après 100 ms (`PRODUCT_LEAVE_DELAY_MS`) : une page prérendue s'affiche avant, sans H. Au clic, la barre des produits se replie : la page d'arrivée la montre repliée.
  - Groupes repliables de la barre latérale : clé propre au produit (`sidebar-group:<produit>:<titre>`), le thème et la barre réduite restent communs à la famille.
  - `@hgdc/auth` : sous `appBasePath`, le cookie `hgdc-org-sync` est limité à ce chemin et porte ce chemin ; un autre produit de la même origine ne le voit plus.

## 0.17.0

### Minor Changes

- 48245f0: `createHgdcEntry` : option `appOrigin` (origine publique, `https://app.hgdc.ch`), envoyée comme `Origin` des appels internes à better-auth. Derrière un relais, l'entrée refusait la connexion dès qu'un cookie périmé était présent.

## 0.16.0

### Minor Changes

- 7b3f2ec: Servir un produit sous un chemin (`https://<hôte>/<produit>`) : option `basePath` de `createAuthProxy` (3e argument), option `appBasePath` de `createHgdcEntry`, option `basePath` de `safeNextPath`, `hgdcEntryUrl`, `hgdcRefreshPath` et `useOrganizationRefresh`, nouveaux `normalizeBasePath` et `withBasePath`. Sans option, rien ne change.

## 0.15.0

### Minor Changes

- c24634e: Ouvrir le Convex d'un produit à l'app de bureau. `appAuthProviders(env)` déclare l'id_token qu'Account émet pour l'app (`customJwt` RS256, audience `HGDC_APP_CLIENT_ID`) ; `appAccess(env, resolveUser)` et l'option `app` de `requireOrgMember` et du nouveau `requireUser` traduisent son identifiant Account en utilisateur du produit (`hgdcAccountLookup`, `userIdOfAccount`) ; `identity.subject` reste celui du produit, l'identifiant Account passe dans `accountUserId`. `HGDC_ISSUER` doit être en https. Nouvelle raison `unknown_user` (`UNAUTHENTICATED`) pour une personne jamais connectée au produit ; `OrgAccess.via` dit d'où vient la requête. Sans `HGDC_APP_CLIENT_ID`, rien ne change.

## 0.14.1

### Patch Changes

- 808260e: `HgdcMark` garde sa taille sans `className` (1.25em, celle du texte du bouton de connexion) au lieu de s'étirer à la taille du SVG, et n'affiche qu'une variante même sans les styles de `@hgdc/ui`.

## 0.14.0

### Minor Changes

- a059269: H Collection identity (direction G « Sur blanc », H « Double »). `ProductBadge`, `FamilyMark` and `HgdcMark` now carry a light and a dark drawing, chosen by the theme through CSS (`data-mark-theme`, `.dark`). `PRODUCT_BADGE_SVG` and `FAMILY_MARK_SVG` become `{ light, dark }`; `HGDC_MARK_DARK_SVG` is new. `family/` ships `<word>.svg`, `<word>-dark.svg` and `hcollection-icon(-dark).svg`; the old `hfamily*.svg` files are gone. `--product-<word>-from/to` take the new colours, email icons are regenerated. `FamilyLoader` draws the H « Double »: the full H fills on the same single 2 s loop (ADR 0015), its reflection stays still at 35 % (50 % in dark).
  
  `family/app/<word>/` ships each product's app icons, ready to copy into its `public/`: `favicon.svg` (both drawings, follows the system theme), `favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180, on white), `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` (on white, inside the 80 % safe zone).

## 0.13.0

### Minor Changes

- d564264: Passage d'un produit à l'autre sans attendre Account (ADR 0016). La barre et le menu des produits pointent vers `/auth/hgdc?refresh=background&next=/` : avec une session du produit ouverte, l'entrée redirige aussitôt et la coque relit les organisations dans un cadre caché. L'entrée refuse (503) tout préchargement qui démarrerait une connexion, et la coque précharge au survol l'entrée des autres produits.

## 0.12.0

### Minor Changes

- d0b9be1: Bascule de domaine d'un déploiement Convex sans coupure de session : `requireIdentity` et `requireOrgMember` acceptent une liste d'émetteurs (`issuer: string | string[]`), `convexIssuers(process.env)` la construit à partir de `CONVEX_SITE_URL` et `CONVEX_PREVIOUS_SITE_URL`, `convexAuthProviders` ajoute le fournisseur de l'ancienne adresse à `auth.config.ts` et `currentAuthConfig` donne au plugin `convex` de better-auth le seul fournisseur courant.

## 0.11.0

### Minor Changes

- cc1c3df: The default label of `HgdcSignInButton` becomes "Se connecter avec HGDC" (HGDC is the company name, not "H family").

## 0.10.0

### Minor Changes

- 7097e19: `createSessionTokenCache` : jeton de session du `beforeLoad` racine repris au navigateur pendant 5 minutes, amorcé par le rendu serveur, relu au serveur. Remplace les caches écrits dans chaque produit ; une navigation ne rappelle plus le serveur avant de s'afficher.

## 0.9.0

### Minor Changes

- e5b20f6: Événements d'Account durcis (ADR 0014, revue adversariale) : signature `v2=` qui couvre l'audience (`audience` obligatoire à la signature et à la réception, `legacy` côté Account pour la transition), corps lu en flux et plafonné (`readBodyText`), `occurredAt` à plus de 5 minutes dans le futur refusé, issue détaillée (`AccountEventOutcome` = `applied`, `duplicate` ou `ignored:<raison>`, `vAccountEventOutcome`, `accountEventOutcomeOf`) journalisée chez le produit, et `verifyHgdcIdToken(...).issuedAt` (iat en ms) à recopier comme `syncedAt`.

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
