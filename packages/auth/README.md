# @hgdc/auth

Connexion d'un produit de la famille à Account (OIDC) : bouton « Se connecter avec HGDC », configuration du client better-auth, proxy `/api/auth` pour TanStack Start et gardes Convex.

| Import              | Contenu                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hgdc/auth`        | `HGDC_ISSUER`, `HGDC_PROVIDER_ID`, `HGDC_SCOPES`, entrée commune (`HGDC_ENTRY_PATH`, `safeNextPath`, `hgdcEntryUrl`), rôles (`highestRole`, `hasRole`), `parseHgdcProfile`, `verifiedOrganizationsFromIdToken`, `verifyHgdcIdToken`, `planOrganizationSync`, fraîcheur (`membershipIsFresh`, `SESSION_TTL_SECONDS`, `MEMBERSHIP_TTL_MS`, `KEY_MEMBERSHIP_TTL_MS`), `createSessionTokenCache` |
| `@hgdc/auth/server` | `hgdcProvider` (plugin `genericOAuth`), `createAuthProxy`, `restoreFetchMode`, `createHgdcEntry`                                                                                                                                                                                                                                                                                             |
| `@hgdc/auth/convex` | `requireIdentity`, `requireOrgMember`, `isAuthError`, `authErrorReason`, `AUTH_ERROR_MESSAGES`                                                                                                                                                                                                                                                                                               |
| `@hgdc/auth/events` | Événements poussés par Account : `ACCOUNT_EVENTS_PATH`, `signAccountEvent`, `verifyAccountEvent`, `handleAccountEventRequest`, `accountEventSchema`, `accountEventIsStale`, `ACCOUNT_EVENT_RETENTION_MS`, et pour Convex `vAccountEvent`, `accountEventsTable`                                                                                                                               |
| `@hgdc/auth/mcp`    | Serveurs MCP autorisés par Account : `MCP_PRODUCTS`, `mcpResource`, `mcpScopes`, `MCP_SCOPES`, `parseMcpScope`, `verifyMcpAccessToken`, `createHgdcJwks`, `mcpProtectedResourceMetadata`                                                                                                                                                                                                     |
| `@hgdc/auth/react`  | `HgdcSignInButton`, `startHgdcSignIn`, `HgdcMark` (le H tricolore de la famille, `HGDC_MARK_SVG`)                                                                                                                                                                                                                                                                                            |

Pairs : better-auth 1.6, convex 1.46+, React 19 (chacun facultatif selon l'import).

## Connecter un produit

1. Demander à HGDC l'enregistrement du produit : il rend un `clientId` et un `clientSecret`. Adresse de retour : `https://<produit>/api/auth/oauth2/callback/hgdc`.
2. Côté better-auth (serveur) :

```ts
import { hgdcProvider } from "@hgdc/auth/server"
import { genericOAuth } from "better-auth/plugins"

plugins: [
  genericOAuth({
    config: [hgdcProvider({ clientId: process.env.HGDC_CLIENT_ID!, clientSecret: process.env.HGDC_CLIENT_SECRET! })],
  }),
]
```

Le profil reçu est validé (`parseHgdcProfile`) avant de créer ou relier un compte ; l'émetteur est vérifié et PKCE est actif. Relier un compte existant par adresse e-mail reste un choix du produit (`account.accountLinking.trustedProviders: ["hgdc"]`).

3. Côté client : plugin `genericOAuthClient()` dans `createAuthClient`, puis

```tsx
import { HgdcSignInButton } from "@hgdc/auth/react"

<HgdcSignInButton authClient={authClient} callbackURL="/tableau-de-bord" className="…" onError={…} />
```

Le bouton n'a pas de style propre : le produit le met en forme. L'attente est exposée par `aria-busy` et `data-pending`.

## Protéger le serveur MCP d'un produit

Account est le serveur d'autorisation (ADR 0009 d'Account). Le client MCP lit le document RFC 9728 du produit, s'enregistre chez Account, la personne choisit une organisation et consent, puis le client présente un JWT d'Account. Le produit le vérifie sans appeler Account :

```ts
import {
  createHgdcJwks,
  mcpProtectedResourceMetadata,
  mcpResource,
  McpTokenError,
  verifyMcpAccessToken,
} from "@hgdc/auth/mcp"
import {
  extractBearer,
  protectedResourceMetadataResponse,
  protectedResourceMetadataUrl,
  unauthorized,
} from "@hgdc/api/bearer"

const keys = createHgdcJwks() // une fois par module
const challenge = {
  resourceMetadata: protectedResourceMetadataUrl(mcpResource("portal")),
  scope: "portal:read portal:write",
}

// GET /.well-known/oauth-protected-resource/portal/mcp
protectedResourceMetadataResponse(mcpProtectedResourceMetadata("portal", { resourceName: "Portal" }))

// Chaque requête MCP
const token = extractBearer(request)
if (!token) return unauthorized(challenge)
try {
  const access = await verifyMcpAccessToken(token, { product: "portal", keys, require: "read" })
  // access.userId, access.organizationId : vérifier encore que la personne est membre de l'organisation.
} catch (error) {
  if (error instanceof McpTokenError) return unauthorized({ ...challenge, error: error.bearerError })
  throw error
}
```

Règles : exiger `require: "write"` pour toute écriture ; ne jamais transmettre le jeton à une autre API ; ne jamais renvoyer `error.message` au client. Le jeton vaut 15 minutes : une révocation dans Account coupe le renouvellement tout de suite.

## Relayer le serveur MCP depuis la console

Quand le serveur MCP vit dans Convex et que la console le sert sous `app.hgdc.ch/<produit>/mcp`, `createMcpProxy` relaie `/mcp`, `/mcp/server-card` et le document RFC 9728 de la ressource, et refuse le reste (404). Il ne transmet que les en-têtes du protocole et `authorization`, jamais `cookie` ; il retire `set-cookie` de la réponse, plafonne le corps à 1 Mio et répond 502 au format JSON-RPC si Convex ne répond pas dans 60 secondes.

```ts
// src/routes/mcp.ts (la route serveur de la console)
import { createMcpProxy } from "@hgdc/auth/server"

const relay = createMcpProxy(process.env.VITE_CONVEX_SITE_URL!, {
  product: "host",
  basePath: "/host", // la base de la console, retirée avant le relais
  addressSecret: () => process.env.AUTH_PROXY_SECRET, // l'adresse du visiteur part signée
})
```

Sans `addressSecret`, l'adresse du visiteur n'est pas signée et Convex ne la voit pas. Le produit doit servir la même liste de routes que Convex : une route ajoutée des deux côtés à la fois.

## Servir le produit sous un chemin

Un produit peut être servi sous `https://<hôte>/<produit>` (base `/analytics`) au lieu de la racine d'un sous-domaine. Chaque option est absente par défaut : sans elle, le comportement est celui d'un produit à la racine. Règle commune : `next` et `errorCallbackURL` sont des chemins **du produit, sans la base** (ceux du routeur) ; le kit remet la base devant avant de rediriger.

```ts
const BASE = "/analytics" // même valeur que la base de Vite et du routeur

// Proxy : retire la base avant de relayer vers Convex (`/analytics/api/auth/x` devient `/api/auth/x`)
export const proxyAuth = createAuthProxy(convexSiteUrl, fetch, { basePath: BASE })

// Entrée : redirige vers `/analytics/<next>` et `/analytics/<errorCallbackURL>`. `appOrigin` : derrière un
// relais, la fonction voit l’hôte relayé ; sans elle, better-auth refuse l’entrée dès qu’un cookie est présent.
const entry = createHgdcEntry({
  proxy: proxyAuth,
  errorCallbackURL: "/connexion?erreur=refus",
  appBasePath: BASE,
  appOrigin: "https://app.hgdc.ch",
})

// Route serveur montée à `/analytics/auth/hgdc`
```

- `safeNextPath(value, fallback, { basePath })` refuse aussi `/analytics/auth/hgdc` et `/analytics/api/auth` (boucle), en plus de la racine.
- `hgdcRefreshPath(next, { basePath })` rend `/analytics/auth/hgdc?refresh=1&next=…` ; `useOrganizationRefresh(unknown, { basePath })` retire la base de l'adresse du navigateur avant d'appeler l'entrée.
- `hgdcEntryUrl("https://app.hgdc.ch", "/o/acme", { basePath: "/analytics" })` : lien vers un produit servi sous un chemin. Le menu « Produits » (`@hgdc/ui/products`) lit la table `PRODUCT_ORIGINS` : une ligne `{ origin, basePath }` par produit migre ce produit seul.
- `normalizeBasePath` valide la base (segments `[A-Za-z0-9._~-]`, pas de `//`, `..`, requête, espace, antislash) et lève sinon : une base vient de la configuration, jamais d'une requête.
- Le proxy ne retire la base qu'une fois, sur une frontière de segment ; un chemin sans la base (les appels internes de l'entrée) passe tel quel.
- Reste à la charge du produit : `redirect({ href })`, balises `<link>` et réponses HTTP qui sortent du routeur passent par la base ; préfixe de cookies distinct par produit (les produits partagent l'hôte et ses cookies). Le cookie `HGDC_ORG_SYNC_COOKIE`, le cadre caché et la règle de préchargement de `@hgdc/ui/product-switch` visent encore la racine de l'hôte : la relecture en arrière-plan n'est pas prête pour un produit sous un chemin.

## Proxy `/api/auth` (TanStack Start + Convex)

À utiliser à la place du `handler` de `@convex-dev/better-auth` 0.12, qui rend un 500 sur tout refus 401 et transforme les redirections OAuth en JSON :

```ts
// src/routes/api/auth/$.ts
const proxy = createAuthProxy(process.env.VITE_CONVEX_SITE_URL!)
// handlers: { GET: ({ request }) => proxy(request), POST: ({ request }) => proxy(request) }

// convex/http.ts
authComponent.registerRoutes(http, (ctx) => {
  const auth = createAuth(ctx)
  return { ...auth, handler: (request: Request) => auth.handler(restoreFetchMode(request)) }
})
```

## Limite de connexion par adresse

better-auth limite chaque adresse (3 essais par 10 s sur `/sign-in/*`, 100 par 10 s ailleurs). Sur Convex, trois pièces la rendent juste :

1. **Adresse signée** : le proxy signe l'adresse du visiteur (`createAuthProxy(url, fetch, { addressSecret })`), Convex la vérifie (`restoreClientAddress`). Même secret des deux côtés, un par produit.
2. **Jamais le `x-forwarded-for` du client** : sans signature valable, `restoreClientAddress` retient l'adresse du reverse proxy seulement si `trustForwardedFor: true` (un proxy qu'on contrôle écrase cet en-tête avant Convex). Sinon, par exemple sur Convex Cloud où le client l'écrit lui-même, l'adresse devient la clé neutre `NEUTRAL_CLIENT_ADDRESS` (`0.0.0.0`) : une limite commune à ces appels, jamais une adresse choisie par le client.
3. **Chemins serveur exclus, table purgée** (`@hgdc/auth/rate-limit`) : `/convex/token`, `/convex/jwks` et `/convex/.well-known/openid-configuration` arrivent du serveur du front, sans signature ; `HGDC_RATE_LIMIT` ne les limite jamais. better-auth ne vide jamais sa table `rateLimit` : `purgeAuthRateLimitBatch` le fait chaque heure.

```ts
// convex/auth.ts
import { HGDC_RATE_LIMIT } from "@hgdc/auth/rate-limit"
import { HGDC_IP_ADDRESS_OPTIONS } from "@hgdc/auth/server"
// betterAuth({ ..., rateLimit: HGDC_RATE_LIMIT, advanced: { ..., ipAddress: HGDC_IP_ADDRESS_OPTIONS } })

// convex/http.ts : sur toutes les routes de better-auth
const trustForwardedFor = process.env.AUTH_TRUST_FORWARDED_FOR === "1"
auth.handler(
  await restoreClientAddress(restoreFetchMode(request), process.env.AUTH_PROXY_SECRET, { trustForwardedFor }),
)

// convex/authRateLimit.ts
import { purgeAuthRateLimitArgs, purgeAuthRateLimitBatch } from "@hgdc/auth/rate-limit"
export const purgeAuthRateLimit = internalMutation({
  args: purgeAuthRateLimitArgs,
  returns: v.null(),
  // Type de retour écrit : `next` renvoie à cette mutation, TypeScript ne peut pas l'inférer.
  handler: async (ctx, { cursor }): Promise<null> =>
    await purgeAuthRateLimitBatch(
      ctx,
      { deleteMany: components.betterAuth.adapter.deleteMany, next: internal.authRateLimit.purgeAuthRateLimit },
      cursor,
    ),
})

// convex/crons.ts
crons.hourly("purge-limite-connexion", { minuteUTC: 20 }, internal.authRateLimit.purgeAuthRateLimit, { cursor: null })
```

`AUTH_TRUST_FORWARDED_FOR` (nom au choix du produit) ne se pose que sur un déploiement derrière un reverse proxy qui écrase `x-forwarded-for`, et ne se recopie jamais vers un déploiement qui ne l'est pas.

## Clés JWKS statiques côté Convex

Chaque appel HTTP à Convex avec un jeton (le rendu serveur de TanStack Start, `fetchAuthQuery`) fait vérifier ce jeton par le backend Convex, qui ne le met jamais en cache. Avec `getAuthConfigProvider()` seul, il va chercher les clés à `<site>/api/auth/convex/jwks` **à chaque appel** : sous charge, cette adresse répond 429 et la page tombe en erreur. Les clés se donnent donc en dur, par la variable `JWKS` du déploiement Convex :

```ts
// convex/auth.config.ts
export default { providers: [getAuthConfigProvider({ jwks: process.env.JWKS })] } satisfies AuthConfig

// convex/auth.ts, dans les plugins
convex({ authConfig, jwks: process.env.JWKS })

// convex/authKeys.ts
export const latestJwks = internalAction({
  args: {},
  handler: async (ctx) => await createAuth(ctx).api.getLatestJwks(),
})
```

Convex refuse un push dont `auth.config.ts` lit une variable absente : la mise en place se fait en deux temps, sur chaque déploiement (prod et dev).

1. Déployer `authKeys.ts` et le plugin `convex({ authConfig, jwks: process.env.JWKS })`, `auth.config.ts` inchangé (le plugin accepte une variable absente).
2. Poser la variable : `npx convex run authKeys:latestJwks --prod | npx convex env set JWKS --prod` (sans `--prod` pour le dev).
3. Passer `jwks: process.env.JWKS` à `getAuthConfigProvider` et redéployer.

Un nouveau déploiement (préversion, local) pose `JWKS` avant son premier push. La variable contient la clé privée chiffrée : elle ne s'affiche jamais. Une copie de référence vit dans Doppler `hgdc/prd`, `<P>_JWKS` (comparer par empreinte, jamais en clair), nécessaire pour poser la variable sur un nouveau déploiement ou après une bascule vers l'auto-hébergé. Après une rotation des clés (deux temps, inchangée), reposer la variable, redéployer, puis recopier dans Doppler.

## Entrée commune `/auth/hgdc`

Le menu « Produits » (`@hgdc/ui/account-menu`) envoie vers `https://<mot>.hgdc.ch/auth/hgdc`, pas vers la page d'accueil publique. Chaque produit monte cette route serveur, au même chemin :

```ts
// src/routes/auth/hgdc.ts
import { createHgdcEntry } from "@hgdc/auth/server"
import { createFileRoute } from "@tanstack/react-router"

import { proxyAuth } from "@/lib/auth-server" // le proxy /api/auth (createAuthProxy)

const entry = createHgdcEntry({ proxy: proxyAuth, errorCallbackURL: "/sign-in?error=1" })

export const Route = createFileRoute("/auth/hgdc")({
  server: { handlers: { GET: ({ request }) => entry(request) } },
})
```

- Session du produit ouverte : redirection vers `next`.
- Sinon la connexion HGDC part aussitôt, côté serveur (même appel que le bouton), avec retour vers `next`. Session d'Account ouverte et produit autorisé : Account renvoie sans formulaire.
- `next` (`?next=/o/acme`) n'accepte qu'un chemin du produit (`safeNextPath`) ; tout le reste devient `/`, que chaque produit redirige vers son app quand la session existe. `errorCallbackURL` : la page de connexion du produit avec son paramètre d'erreur.
- Lien vers un produit depuis ailleurs : `hgdcEntryUrl("https://mail.hgdc.ch", "/o/acme")`.

### Relire les organisations : `refresh=1`

Le claim `organizations` n'est lu qu'à la création d'une session (étape 1 ci-dessous). Une organisation rejointe dans Account reste donc invisible dans un produit dont la session est ouverte, jusqu'à 7 jours. `refresh=1` repasse par Account même avec une session ouverte : la nouvelle session relit le claim, sans formulaire quand la session d'Account existe.

- Barre et menu des produits (`@hgdc/ui/products`) : `https://<mot>.hgdc.ch/auth/hgdc?refresh=background&next=/` (ADR 0016). Session du produit ouverte : redirection immédiate vers `next` et cookie `HGDC_ORG_SYNC_COOKIE` (sous `appBasePath`, limité à ce chemin et portant ce chemin : `hgdc-org-sync=/analytics; Path=/analytics`, un autre produit de la même origine ne le voit pas) ; la racine du document (`FamilyLoaderRoot`) le consomme et relit les organisations dans un cadre caché sans script (`HGDC_BACKGROUND_REFRESH_PATH`, `frame=1`), qui revient sur une réponse vide (`HGDC_FRAME_DONE_PATH`). La nouvelle session recopie les organisations, les requêtes abonnées se mettent à jour. Sans session : connexion habituelle.
- Préchargement au survol (Speculation Rules, `prefetch` seulement) : l'entrée ne rend que la redirection d'une session ouverte ; tout ce qui démarrerait une connexion (`refresh=1`, `frame=1`, pas de session) répond 503 à une requête `Sec-Purpose: prefetch`.
- Page d'une organisation inconnue du produit (ou dont la personne n'est pas membre localement) : une seule redirection vers `hgdcRefreshPath("/o/acme")` avant d'afficher « introuvable ». Au retour, `next` porte `?synced=1` : `hasSyncedMarker(location.search)` vrai, la page affiche « introuvable » au lieu de relancer. L'entrée elle-même ne relance jamais un `next` déjà marqué : pas de boucle.

```tsx
// Côté client, une fois les organisations chargées
import { useOrganizationRefresh } from "@hgdc/auth/react"

const refreshing = useOrganizationRefresh(viewer !== undefined && !space)
if (refreshing) return <FamilyLoader page />
if (!space) return <NotFound />

// Dans un loader ou un beforeLoad (rendu serveur compris)
import { hasSyncedMarker, hgdcRefreshPath } from "@hgdc/auth"
if (!organization && !hasSyncedMarker(location.searchStr))
  throw redirect({ href: hgdcRefreshPath(location.href), reloadDocument: true })
```

- L'ancienne session n'est pas révoquée : si Account ne répond pas, la personne garde son accès, et la session expire seule (`SESSION_TTL_SECONDS`).
- Lien vers un produit avec relecture : `hgdcEntryUrl(origin, "/o/acme", { refresh: true })`.

Décisions : ADR 0010, ADR 0013, ADR 0016.

## Session dans le `beforeLoad` de la racine

Sans cache, chaque navigation côté navigateur rappelait le serveur (`getAuth`) avant tout rendu : l'ancienne page restait figée, et TanStack Router n'affiche aucun chargement pendant un `beforeLoad`. `createSessionTokenCache` reprend au navigateur une session ouverte pendant 5 minutes (le client Convex renouvelle lui-même son jeton), relit toujours au serveur, et s'amorce avec le jeton du rendu serveur :

```ts
const session = createSessionTokenCache(() => getAuth())

export const Route = createRootRouteWithContext<…>()({
  beforeLoad: async ({ context }) => {
    const token = await session.read()
    if (token) context.convexQueryClient.serverHttpClient?.setAuth(token)
    return { isAuthenticated: Boolean(token), token }
  },
  component: () => {
    const context = Route.useRouteContext()
    useEffect(() => session.seed(context.token), [context.token])
    …
  },
})
```

Une absence de session n'est jamais gardée. Déconnexion : recharger la page, ou `session.clear()`.

## Garder une fonction Convex

```ts
import { convexIssuers, requireOrgMember } from "@hgdc/auth/convex"

const { userId, role } = await requireOrgMember(ctx, organizationId, {
  issuer: convexIssuers(process.env), // émetteurs des JWT du plugin convex
  minRole: "admin",
  load: async (ctx, { organizationId, userId }) => /* appartenance lue dans la base du produit */ null,
})
```

À appeler avant toute lecture ou écriture. L'émetteur est obligatoire : un `subject` n'est unique que chez son émetteur, et sans ce contrôle un autre fournisseur accepté par Convex pourrait se faire passer pour un membre. Une appartenance rendue pour une autre personne ou une autre organisation est refusée.

Un refus est une `ConvexError({ code, reason, message })`. `message` s'affiche tel quel (tutoiement) ; pour décider quoi montrer, lire `reason`, jamais le texte :

| `reason`            | `code`            | Cas                                        |
| ------------------- | ----------------- | ------------------------------------------ |
| `no_session`        | `UNAUTHENTICATED` | Personne n'est connecté                    |
| `wrong_issuer`      | `UNAUTHENTICATED` | Jeton d'un autre émetteur                  |
| `unknown_user`      | `UNAUTHENTICATED` | Jeton de l'app, jamais connecté au produit |
| `not_member`        | `FORBIDDEN`       | La personne n'est pas dans l'organisation  |
| `insufficient_role` | `FORBIDDEN`       | Elle en est membre, rôle insuffisant       |

```ts
import { authErrorReason } from "@hgdc/auth/convex"

if (authErrorReason(error) === "insufficient_role") showUpgradeHint()
```

`authErrorReason` marche des deux côtés (la `ConvexError` reconstruite par le client garde ses données) et déduit la raison d'une erreur d'avant 0.4 par son code.

Les organisations arrivent par la portée `organizations` : claim `organizations: [{ id, slug, name, role }]` de l'id_token et de userinfo.

### Changer le domaine du déploiement Convex

Les jetons du plugin `convex` portent l'émetteur `CONVEX_SITE_URL`. Quand l'adresse du déploiement change (domaine personnalisé posé par `update_canonical_url`, migration vers un Convex auto-hébergé), les jetons déjà émis gardent l'ancienne pendant leur durée de vie (15 minutes) : Convex les refuse sur une connexion neuve (`NoAuthProvider`) et la garde répond `wrong_issuer` sur un WebSocket ouvert. La variable `CONVEX_PREVIOUS_SITE_URL` ouvre une fenêtre où les deux émetteurs sont acceptés :

```ts
// convex/auth.config.ts
import { convexAuthProviders } from "@hgdc/auth/convex"

export default {
  providers: convexAuthProviders(getAuthConfigProvider({ jwks: process.env.JWKS }), process.env),
} satisfies AuthConfig

// convex/auth.ts, dans les plugins : le plugin refuse deux fournisseurs « convex »
convex({ authConfig: currentAuthConfig(authConfig), jwks: process.env.JWKS })

// gardes
await requireIdentity(ctx, { issuer: convexIssuers(process.env) })
```

1. Poser `CONVEX_PREVIOUS_SITE_URL` à l'adresse actuelle (`npx convex env set`), puis `convex deploy`.
2. Changer l'adresse. Les nouveaux jetons portent le nouvel émetteur, les anciens restent acceptés.
3. Attendre 30 minutes (deux fois la durée d'un jeton), retirer la variable, redéployer.

Hors bascule, la variable est absente et rien ne change : `convexAuthProviders` rend le seul fournisseur, `convexIssuers` la seule `CONVEX_SITE_URL`. La liste ne sert qu'à donner deux adresses au même émetteur (même clé, mêmes utilisateurs), jamais à accepter un autre fournisseur.

### Ouvrir le Convex du produit à l'app de bureau

L'app de bureau affiche les écrans des produits en appelant leur Convex directement, avec l'id_token qu'Account lui émet (RS256, audience : son client OAuth, renouvelé par son jeton de renouvellement). Le produit l'accepte quand `HGDC_APP_CLIENT_ID` est posée :

```ts
// convex/auth.config.ts : le fournisseur de l'app vient après, `currentAuthConfig` ne garde que le premier
providers: [...convexAuthProviders(provider, process.env), ...appAuthProviders(process.env)]

// gardes : l'id_token désigne la personne par son identifiant Account, traduit en utilisateur du produit
const app = appAccess<QueryCtx>(process.env, async (ctx, accountUserId) =>
  userIdOfAccount(await ctx.runQuery(components.betterAuth.adapter.findOne, hgdcAccountLookup(accountUserId))),
)
await requireOrgMember(ctx, organizationId, { issuer: convexIssuers(process.env), app, load })
const { userId } = await requireUser(ctx, { issuer: convexIssuers(process.env), app })
```

`identity.subject` reste un identifiant du produit (l'identifiant Account est dans `accountUserId`). `HGDC_ISSUER` doit être en https, sauf Account local. L'appartenance reste celle de la copie du produit : une personne qui ne s'est jamais connectée au produit reçoit `unknown_user`. `requireIdentity` n'accepte toujours que les jetons du produit.

## Synchroniser les organisations

Les organisations vivent dans Account ; le produit en garde une copie (espace par organisation, appartenances) que lit le chargeur de `requireOrgMember`. Le modèle recommandé, celui de Host :

1. **Synchroniser dans `databaseHooks.session.create.before`**, avant que la session existe. Un id_token refusé fait échouer la connexion plutôt que d'ouvrir une session sur des droits périmés.
2. **Sessions de 7 jours sans prolongation** : `session: { expiresIn: SESSION_TTL_SECONDS, disableSessionRefresh: true }`. Les organisations sont donc relues au moins une fois par semaine.
3. **Appartenance périmée, pas d'accès** : chaque appartenance garde `syncedAt` (remis à jour à chaque connexion, même sans changement), et le chargeur rend `null` quand `membershipIsFresh` est faux. Une personne retirée dans Account perd l'accès au plus tard 8 jours après (`MEMBERSHIP_TTL_MS`).

```ts
import { HGDC_ISSUER, membershipIsFresh, planOrganizationSync, verifiedOrganizationsFromIdToken } from "@hgdc/auth"

// better-auth : databaseHooks.session.create.before
const hgdc = accounts.find((a) => a.providerId === "hgdc") // exactement un, sinon refuser
const claimed = verifiedOrganizationsFromIdToken(hgdc.idToken ?? "", {
  issuer: HGDC_ISSUER,
  clientId: process.env.HGDC_CLIENT_ID!,
  now: Date.now(),
}) // lève HgdcIdTokenError : émetteur, audience (clientId), iat de plus de 10 minutes
const plan = planOrganizationSync(claimed, membershipsOfThisUser)
// mutation interne : plan.upsert (espace + appartenance), plan.remove, et syncedAt = issuedAt partout (iat du jeton, verifyHgdcIdToken), jamais Date.now()

// chargeur de requireOrgMember
load: async (ctx, { organizationId, userId }) => {
  const member = /* appartenance lue dans la base du produit */
  return member && membershipIsFresh(member, Date.now()) ? member : null
}
```

`verifyHgdcIdToken` rend aussi les claims du profil (nom, adresse, photo) pour les recopier. La signature n'est pas revérifiée : le jeton arrive du point de jeton d'Account, reçu en TLS par le serveur (OpenID Connect Core 3.1.3.7, point 6) ; le contrôle de fraîcheur empêche qu'un ancien jeton resté dans la table `account` rejoue des organisations. Une clé d'API vit hors session : `membershipIsFresh(member, now, KEY_MEMBERSHIP_TTL_MS)` lui laisse 30 jours. Les copies périmées se purgent par un cron.

## Appliquer les événements d'Account

Account pousse les retraits, changements de rôle et suppressions d'organisation à chaque produit, sans attendre la session suivante (ADR 0014). Le produit expose `POST /hgdc/v1/account-events` sur son déploiement Convex :

```ts
// convex/http.ts
import { ACCOUNT_EVENTS_PATH, handleAccountEventRequest } from "@hgdc/auth/events"

http.route({
  path: ACCOUNT_EVENTS_PATH,
  method: "POST",
  handler: httpAction(async (ctx, request) =>
    handleAccountEventRequest(request, {
      audience: "host", // le produit : signé par Account, vérifié ici
      secret: process.env.ACCOUNT_EVENTS_SECRET,
      apply: (event) => ctx.runMutation(internal.organizations.applyAccountEvent, { event }),
    }),
  ),
})

// convex/schema.ts : accountEvents: accountEventsTable (de @hgdc/auth/events)

// convex/organizations.ts
export const applyAccountEvent = internalMutation({
  args: { event: vAccountEvent },
  returns: vAccountEventOutcome, // "applied" | "duplicate" | "ignored:<raison>"
  handler: async (ctx, { event }) => {
    const seen = await ctx.db
      .query("accountEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", event.id))
      .first()
    if (seen) return "duplicate"
    await ctx.db.insert("accountEvents", { eventId: event.id, type: event.type, receivedAt: Date.now() })
    // personne locale : compte better-auth `providerId: "hgdc"`, `accountId: event.userId`
    // member.removed : retirer l'appartenance, sauf si accountEventIsStale(event, membre.syncedAt)
    // member.role_changed : rôle et syncedAt = max(syncedAt, event.occurredAt) ; ne crée jamais d'appartenance
    // organization.deleted : retirer toutes les appartenances, garder les données de l'espace
    // rien à appliquer : "ignored:unknown_organization" | "ignored:unknown_user" | "ignored:not_member" | "ignored:stale"
    return "applied"
  },
})
```

Le secret (32 caractères au moins) est propre au produit : `ACCOUNT_EVENTS_SECRET` chez lui, `ACCOUNT_EVENTS_SECRET_<PRODUIT>` chez Account avec l'adresse de l'endpoint. La signature `v2=` couvre l'audience (`x-hgdc-audience`, le produit destinataire) : un événement signé pour un autre produit rend 401. Le corps est lu en flux et plafonné à 8 Ko (`readBodyText`, réutilisable). Sans secret, l'endpoint répond 503 et Account réessaie (1, 5, 15, 60 minutes). Une signature invalide ou d'une autre audience, ou un horodatage à plus de 5 minutes rendent 401 ; un corps invalide ou un `occurredAt` à plus de 5 minutes dans le futur, 400. La réponse 200 porte l'issue : `{"status":"applied"}`, `{"status":"duplicate"}` ou `{"status":"ignored","reason":…}` (`unknown_organization`, `unknown_user`, `not_member`, `stale`), journalisée en avertissement chez le produit ; Account remonte à GlitchTip un retrait ignoré pour une autre raison que `unknown_organization`. Les identifiants se purgent après `ACCOUNT_EVENT_RETENTION_MS` (cron, index `by_received`).

Ordre : `accountEventIsStale(event, syncedAt)` compare l'événement à `syncedAt`, qui doit être l'`iat` du jeton lu à la connexion (`verifyHgdcIdToken(...).issuedAt`) et non l'heure de la copie : un jeton émis avant un retrait mais lu après ne doit pas le masquer.

Les gardes doivent lire l'appartenance à chaque requête (chargeur de `requireOrgMember`) : c'est ce qui rend le retrait immédiat.

Tous droits réservés, Hugo Gebel Développement Conseil.
