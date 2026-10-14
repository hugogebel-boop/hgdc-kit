# @hgdc/auth

Connexion d'un produit HGDC à HGDC Account (OIDC) : bouton « Se connecter avec HGDC », configuration du client better-auth, proxy `/api/auth` pour TanStack Start et gardes Convex.

| Import              | Contenu                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `@hgdc/auth`        | `HGDC_ISSUER`, `HGDC_PROVIDER_ID`, `HGDC_SCOPES`, rôles (`highestRole`, `hasRole`), `parseHgdcProfile`, `organizationsFromIdToken`, `planOrganizationSync` |
| `@hgdc/auth/server` | `hgdcProvider` (plugin `genericOAuth`), `createAuthProxy`, `restoreFetchMode`                          |
| `@hgdc/auth/convex` | `requireIdentity`, `requireOrgMember`, `isAuthError`                                                   |
| `@hgdc/auth/react`  | `HgdcSignInButton`, `startHgdcSignIn`, `HgdcMark`                                                      |

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

## Garder une fonction Convex

```ts
import { requireOrgMember } from "@hgdc/auth/convex"

const { userId, role } = await requireOrgMember(ctx, organizationId, {
  issuer: process.env.CONVEX_SITE_URL!, // émetteur des JWT du plugin convex
  minRole: "admin",
  load: async (ctx, { organizationId, userId }) => /* appartenance lue dans la base du produit */ null,
})
```

À appeler avant toute lecture ou écriture. L'émetteur est obligatoire : un `subject` n'est unique que chez son émetteur, et sans ce contrôle un autre fournisseur accepté par Convex pourrait se faire passer pour un membre. Sans session ou d'un autre émetteur : `ConvexError({ code: "UNAUTHENTICATED" })`. Personne étrangère à l'organisation ou rôle insuffisant : `FORBIDDEN`. Une appartenance rendue pour une autre personne ou une autre organisation est refusée.

Les organisations arrivent par la portée `organizations` : claim `organizations: [{ id, slug, name, role }]` de l'id_token et de userinfo.

## Synchroniser les organisations

Les organisations vivent dans Account ; le produit en garde une copie (espace par organisation, appartenances) que lit le chargeur de `requireOrgMember`. Elle se met à jour à chaque connexion :

```ts
import { organizationsFromIdToken, planOrganizationSync } from "@hgdc/auth"

// better-auth : databaseHooks.session.create.after → mutation interne du produit
const account = /* ligne `account` de la personne avec providerId "hgdc" */
const claimed = organizationsFromIdToken(account.idToken) // jeton reçu du point de jeton, déjà validé
const plan = planOrganizationSync(claimed, membershipsOfThisUser)
// plan.upsert : créer l'espace (index unique sur organizationId) et l'appartenance, ou mettre à jour rôle, nom, slug
// plan.remove : retirer les appartenances des organisations quittées
```

Un rôle changé dans Account n'arrive qu'à la connexion suivante : garder des sessions courtes (7 jours au plus).

Tous droits réservés, Hugo Gebel Développement Conseil.
