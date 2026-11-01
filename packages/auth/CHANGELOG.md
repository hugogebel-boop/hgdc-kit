# @hgdc/auth

## 0.31.0

### Minor Changes

- 7e747f3: `manager` rejoint `MCP_PRODUCTS` : serveur MCP de Manager à `https://app.hgdc.ch/manager/mcp`, scopes `manager:read` et `manager:write`. `createMcpProxy` accepte `convexPrefix` pour un serveur MCP qui partage le déploiement Convex d'un autre produit (Manager sur celui d'ID : `/manager/mcp`).

## 0.30.0

### Minor Changes

- 8245a62: Temps 4 de l'ADR 0015 de la famille : `HGDC_ISSUER` vaut `https://id.hgdc.ch/api/auth`. Les produits ouvrent l'autorisation, échangent le code et lisent les clés (`HGDC_JWKS_URL`) sur `id.hgdc.ch`, et leurs documents de ressource MCP (RFC 9728) annoncent ce nom. L'ancien nom devient `HGDC_LEGACY_ISSUER` et reste accepté (`HGDC_ACCEPTED_ISSUERS`) jusqu'à la fin de la fenêtre (temps 5). `HGDC_ID_ISSUER` est gardé comme alias de `HGDC_ISSUER`.

## 0.29.0

### Minor Changes

- f33ddf8: Bouton « Se connecter avec ID » : fond rouge d'ID, texte blanc (AA), double croix blanche à gauche, états survol, appui, focus visible et désactivé. Nouvelle marque `@hgdc/ui/family/id-mark.svg` (double croix sans fond, pour un fond rouge) ; l'icône d'app reste `family/id.svg`.

## 0.28.0

### Minor Changes

- 5f39700: `HgdcConvexAuthProvider` (`@hgdc/auth/convex-react`) : `ConvexBetterAuthProvider` qui accepte le client de better-auth 1.6.18 et plus, sans cast dans les produits.

## 0.27.0

### Minor Changes

- 14171e3: `@hgdc/auth` : l'émetteur de production a deux noms le temps de la migration vers ID (ADR 0015 de la famille). `HGDC_ID_ISSUER`, `HGDC_ACCEPTED_ISSUERS` et `acceptedIssuers` : quand l'émetteur attendu est l'un des deux noms, l'autre est accepté aussi ; un Account local ou d'essai reste seul. Lu par `verifyHgdcIdToken`, `verifyMcpAccessToken`, `appAuthProviders` (un fournisseur `customJwt` par nom, mêmes clés) et `appAccess`/`requireUser` (`AppAccess.issuer` accepte une liste). `hgdcProvider` n'utilise plus la découverte ni le contrôle strict de `iss` de `genericOAuth`, qui couperait toute connexion au changement de nom : points OAuth déduits de l'émetteur, et `iss` (RFC 9207) exigé et vérifié par `assertCallbackIssuer` avant l'échange du code. Aucun changement de code dans les produits.
  
  `@hgdc/config` : `stack.json` fixe la version exacte de chaque paquet `@hgdc/*` du kit, tenue par la release (`scripts/stack-versions.ts`) ; `hgdc-stack sync` les aligne dans les produits.

## 0.26.0

### Minor Changes

- 588fcc2: `viewAuthSites(product, { siteUrl, basePath })` : adresses des deux instances de better-auth d'un produit servi sous `app.hgdc.ch/<mot>` (vue `app` et vue seule sur `<mot>.hgdc.ch`, ADR 0014 de la famille), côté Convex. Origine de la vue seule constante ; instance seule fermée (`soloEnabled: false`) sans la base du produit.

## 0.25.0

### Minor Changes

- 2c38ede: Vue seule d'un produit sur `<mot>.hgdc.ch` (ADR 0014 de la famille), à adopter produit par produit.
  
  `@hgdc/ui` : `soloOrigin`, `viewOrigin`, `viewFromHostname`, `soloHref`, `CONSOLE_ORIGINS` (`addresses`), `otherViewHref` (`products`), réglage « Barre des produits » relu chez Account (`product-bar`). `AppShell` reçoit `view` : donné, la barre suit la vue et le réglage, et la coque ajoute « Ouvrir seul » ou « Ouvrir dans app.hgdc.ch » ; absent, rien ne change (barre présente).
  
  `@hgdc/auth` : `VIEW_HEADER`, `requestView` ; `createAuthProxy({ soloView: true })` envoie la vue seule vers l'instance de better-auth montée sous la base, refuse une base doublée en vue `app` et tout chemin ambigu (`//`, `%2f`, `%5c`) ; `createHgdcEntry` reçoit `soloOrigin` (exige `appBasePath`), sans lui l'en-tête de vue est ignoré ; cookie `hgdc-org-sync` en `Path=/` en vue seule. Cookies `__Host-` : `hgdcCookieOptions`, `hostCookiePrefix` (seule source du préfixe, Convex et front), `assertHostCookies` (à appeler sur `getCookies(options)`), `withoutShadowCookies` (retire les `__Secure-__Host-*` avant le handler de Start). Ordre : l'edge accepte d'abord `__Host-hgdc-` sur ses relais, puis Convex et le front du produit ensemble.

## 0.24.1

### Patch Changes

- 1866f4c: Stack : better-auth 1.6.33 (GHSA-qq9h-g4jm-xgf3, prise de compte par un mot de passe posé avant la connexion par lien magique ou code e-mail), zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, mémoire épuisée par un grand tableau). `@better-auth/oauth-provider` et `@better-auth/passkey` entrent dans la stack, à la même version que better-auth. `@hgdc/auth` demande better-auth 1.6.22 au moins ; `@hgdc/auth`, `@hgdc/api` et `@hgdc/assistant` demandent zod 4.6.7 au moins.

## 0.24.0

### Minor Changes

- 56b235c: New `@hgdc/auth/expired`: `purgeExpiredAuthArgs` and `purgeExpiredAuthBatch` delete expired better-auth `session` rows, then expired `verification` rows, in batches of 500 through the component adapter (`expiresAt < now`, `expiresAt` index). better-auth only deletes an expired session when it reads it again, so abandoned sessions kept their IP address and user agent forever. Valid sessions are never touched. Run it hourly from a product cron starting at `{ model: "session", cursor: null }`.

## 0.23.0

### Minor Changes

- d4de156: MCP step-up and ASCII challenges.
  
  - `@hgdc/auth/mcp`: `McpTokenError.scope` names the missing scope (`<product>:read` or `<product>:write`) on `insufficient_scope`. New `mcpTokenChallenge(error)` returns the Bearer challenge to spread into `unauthorized()`: `{ error: "invalid_token" }` (401) or `{ error: "insufficient_scope", scope }` (403, RFC 6750 § 3.1, MCP authorization step-up). The 403 now names the missing scope (`scope="<product>:read"`), so an MCP client can step up instead of failing.
  - `@hgdc/api/bearer`: every `WWW-Authenticate` parameter is printable ASCII (`asciiChallengeText`: accents stripped, typographic quotes and dashes folded, `"` and `\` dropped), as RFC 6750 § 3 requires for `error_description` (`œ`, `æ`, `ß` spelled out); a parameter left empty is omitted. The accented message stays in the problem+json `detail`.

## 0.22.0

### Minor Changes

- 7f5d6e5: Sign-in rate limit shared by every product.
  
  - `restoreClientAddress` never keeps a client-written `x-forwarded-for` without a valid signature. It now always sets `x-forwarded-for`, `x-real-ip` and the new `x-hgdc-rate-limit-address` to one address: the signed one, else the reverse proxy address when `trustForwardedFor: true` (a proxy you run that overwrites `x-forwarded-for`), else the neutral key `NEUTRAL_CLIENT_ADDRESS` (`0.0.0.0`, one shared limit). Third argument: `{ now, trustForwardedFor }` (a number still works as `now`).
  - `HGDC_IP_ADDRESS_OPTIONS` for better-auth `advanced.ipAddress`: reads only the header set by `restoreClientAddress`.
  - New `@hgdc/auth/rate-limit`: `SERVER_AUTH_PATHS` (server-called paths never limited), `HGDC_RATE_LIMIT` (database storage, those paths excluded), `purgeAuthRateLimitArgs` and `purgeAuthRateLimitBatch` (hourly purge of the `rateLimit` table).
  
  Behaviour change: behind a trusted reverse proxy, pass `trustForwardedFor: true`, or unsigned calls share the neutral key.
  
  Requires the `rateLimit` table in the better-auth schema (present in the `@convex-dev/better-auth` component schema; regenerate a local schema). Invalid addresses (rejected by better-auth) now fall back to the neutral key instead of silently disabling the limit.

## 0.21.0

### Minor Changes

- 8bbf399: Relais partagé du serveur MCP d'un produit : `createMcpProxy` dans `@hgdc/auth/server`, qui ne transmet que les en-têtes du protocole, retire `set-cookie`, plafonne le corps à 1 Mio et signe l'adresse du visiteur.

## 0.20.0

### Minor Changes

- 77d89c1: `createAuthProxy`: new `addressSecret` option signs the visitor address (HMAC-SHA-256, bound to method, path and time, 60 s). `restoreClientAddress(request, secret)` on the Convex side puts a valid signed address in `x-forwarded-for` before better-auth, so its per-IP rate limit no longer counts every visitor as the front server. Unsigned, forged or stale headers are dropped and the reverse proxy address is kept.
  
  The address comes from `x-real-ip` only (set by Host's edge or Vercel), never `x-forwarded-for`. Use one secret per product: the signature does not cover the host.

## 0.19.0

### Minor Changes

- fae78f6: `@hgdc/auth/mcp` : Account devient le serveur d'autorisation des serveurs MCP des produits (ADR 0009 d'Account). Seule déclaration des produits MCP (`MCP_PRODUCTS`), de leur adresse canonique (`mcpResource`, `MCP_RESOURCES`) et de leurs scopes `<produit>:read|write` (`mcpScopes`, `MCP_SCOPES`, `parseMcpScope`). `verifyMcpAccessToken` vérifie hors ligne un jeton d'accès d'Account pour un produit : RS256 par les clés d'Account (`createHgdcJwks`, cache et relecture limitée), émetteur, audience du produit et rien d'autre, dates, personne, client, organisation (`org_id`), et au moins un scope du produit (`require: "write"` pour une écriture). Un jeton d'un autre produit est refusé même s'il porte un scope du produit (confused deputy, GHSA-p2fr-6hmx-4528). `mcpProtectedResourceMetadata` rend le document RFC 9728 du produit. Web Crypto seulement : tourne dans Convex.

## 0.18.0

### Minor Changes

- b2cdf24: IAssistant reçoit les événements d'organisation d'Account (`ACCOUNT_EVENT_AUDIENCES`).

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
