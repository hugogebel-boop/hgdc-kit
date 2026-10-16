# @hgdc/auth

Connexion d'un produit de la famille à Account (OIDC) : bouton « Se connecter avec H family », configuration du client better-auth, proxy `/api/auth` pour TanStack Start et gardes Convex.

| Import              | Contenu                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hgdc/auth`        | `HGDC_ISSUER`, `HGDC_PROVIDER_ID`, `HGDC_SCOPES`, entrée commune (`HGDC_ENTRY_PATH`, `safeNextPath`, `hgdcEntryUrl`), rôles (`highestRole`, `hasRole`), `parseHgdcProfile`, `verifiedOrganizationsFromIdToken`, `verifyHgdcIdToken`, `planOrganizationSync`, fraîcheur (`membershipIsFresh`, `SESSION_TTL_SECONDS`, `MEMBERSHIP_TTL_MS`, `KEY_MEMBERSHIP_TTL_MS`) |
| `@hgdc/auth/server` | `hgdcProvider` (plugin `genericOAuth`), `createAuthProxy`, `restoreFetchMode`, `createHgdcEntry`                                                                                                                                                                                                                                                                  |
| `@hgdc/auth/convex` | `requireIdentity`, `requireOrgMember`, `isAuthError`, `authErrorReason`, `AUTH_ERROR_MESSAGES`                                                                                                                                                                                                                                                                    |
| `@hgdc/auth/react`  | `HgdcSignInButton`, `startHgdcSignIn`, `HgdcMark` (le H tricolore de la famille, `HGDC_MARK_SVG`)                                                                                                                                                                                                                                                                 |

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

Un nouveau déploiement (préversion, local) pose `JWKS` avant son premier push. La variable contient la clé privée chiffrée : elle ne sort jamais du déploiement (ni affichée, ni copiée ailleurs). Après une rotation des clés, reposer la variable puis redéployer.

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

- Barre et menu des produits (`@hgdc/ui/products`) : `https://<mot>.hgdc.ch/auth/hgdc?refresh=1&next=/`. Chaque passage d'un produit à l'autre resynchronise.
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

Décisions : ADR 0010, ADR 0013.

## Garder une fonction Convex

```ts
import { requireOrgMember } from "@hgdc/auth/convex"

const { userId, role } = await requireOrgMember(ctx, organizationId, {
  issuer: process.env.CONVEX_SITE_URL!, // émetteur des JWT du plugin convex
  minRole: "admin",
  load: async (ctx, { organizationId, userId }) => /* appartenance lue dans la base du produit */ null,
})
```

À appeler avant toute lecture ou écriture. L'émetteur est obligatoire : un `subject` n'est unique que chez son émetteur, et sans ce contrôle un autre fournisseur accepté par Convex pourrait se faire passer pour un membre. Une appartenance rendue pour une autre personne ou une autre organisation est refusée.

Un refus est une `ConvexError({ code, reason, message })`. `message` s'affiche tel quel (tutoiement) ; pour décider quoi montrer, lire `reason`, jamais le texte :

| `reason`            | `code`            | Cas                                       |
| ------------------- | ----------------- | ----------------------------------------- |
| `no_session`        | `UNAUTHENTICATED` | Personne n'est connecté                   |
| `wrong_issuer`      | `UNAUTHENTICATED` | Jeton d'un autre émetteur                 |
| `not_member`        | `FORBIDDEN`       | La personne n'est pas dans l'organisation |
| `insufficient_role` | `FORBIDDEN`       | Elle en est membre, rôle insuffisant      |

```ts
import { authErrorReason } from "@hgdc/auth/convex"

if (authErrorReason(error) === "insufficient_role") showUpgradeHint()
```

`authErrorReason` marche des deux côtés (la `ConvexError` reconstruite par le client garde ses données) et déduit la raison d'une erreur d'avant 0.4 par son code.

Les organisations arrivent par la portée `organizations` : claim `organizations: [{ id, slug, name, role }]` de l'id_token et de userinfo.

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
// mutation interne : plan.upsert (espace + appartenance), plan.remove, et syncedAt = Date.now() partout

// chargeur de requireOrgMember
load: async (ctx, { organizationId, userId }) => {
  const member = /* appartenance lue dans la base du produit */
  return member && membershipIsFresh(member, Date.now()) ? member : null
}
```

`verifyHgdcIdToken` rend aussi les claims du profil (nom, adresse, photo) pour les recopier. La signature n'est pas revérifiée : le jeton arrive du point de jeton d'Account, reçu en TLS par le serveur (OpenID Connect Core 3.1.3.7, point 6) ; le contrôle de fraîcheur empêche qu'un ancien jeton resté dans la table `account` rejoue des organisations. Une clé d'API vit hors session : `membershipIsFresh(member, now, KEY_MEMBERSHIP_TTL_MS)` lui laisse 30 jours. Les copies périmées se purgent par un cron.

Tous droits réservés, Hugo Gebel Développement Conseil.
