---
"@hgdc/config": minor
---

Stack : `@convex-dev/better-auth` 0.12.7 (GHSA-9qq3-v9g3-cxhw, GHSA-4qvm-r4pr-v3wg, GHSA-j8qq-g9pm-v3c2, GHSA-pgx2-m66h-x29f) et `convex` 1.48.0 (la CLI ne montre plus les valeurs des variables d'environnement dans `--verbose`, ni à un agent dans `env list`). better-auth reste en 1.6.33.

À savoir pour un produit qui monte :

- `registerRoutes` ne reprend plus `x-better-auth-forwarded-host` que si l'origine figure exactement dans `trustedOrigins` ; sinon better-auth voit `CONVEX_SITE_URL`. Sans effet quand `baseURL` est fixe, ce que fait chaque produit en production.
- Le cookie `convex_jwt` n'est plus posé à la connexion (`/sign-in`, `/sign-up`, retours OAuth) mais effacé : `/convex/token` ou le `/get-session` suivant le repose.
- Depuis `convex` 1.47, `npx convex deploy` hors d'un terminal interactif échoue s'il doit créer ou changer un index sur une table de plus de 100 000 documents : passer `--skip-large-indexes-check` ou un index `staged`.

Les plages des `peerDependencies` de `@hgdc/auth` et `@hgdc/assistant` ne changent pas.
