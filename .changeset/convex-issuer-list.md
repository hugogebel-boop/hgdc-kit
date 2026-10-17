---
"@hgdc/auth": minor
---

Bascule de domaine d'un déploiement Convex sans coupure de session : `requireIdentity` et `requireOrgMember` acceptent une liste d'émetteurs (`issuer: string | string[]`), `convexIssuers(process.env)` la construit à partir de `CONVEX_SITE_URL` et `CONVEX_PREVIOUS_SITE_URL`, `convexAuthProviders` ajoute le fournisseur de l'ancienne adresse à `auth.config.ts` et `currentAuthConfig` donne au plugin `convex` de better-auth le seul fournisseur courant.
