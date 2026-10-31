---
"@hgdc/auth": minor
"@hgdc/config": minor
---

`@hgdc/auth` : l'émetteur de production a deux noms le temps de la migration vers ID (ADR 0015 de la famille). `HGDC_ID_ISSUER`, `HGDC_ACCEPTED_ISSUERS` et `acceptedIssuers` : quand l'émetteur attendu est l'un des deux noms, l'autre est accepté aussi ; un Account local ou d'essai reste seul. Lu par `verifyHgdcIdToken`, `verifyMcpAccessToken`, `appAuthProviders` (un fournisseur `customJwt` par nom, mêmes clés) et `appAccess`/`requireUser` (`AppAccess.issuer` accepte une liste). `hgdcProvider` n'utilise plus la découverte ni le contrôle strict de `iss` de `genericOAuth`, qui couperait toute connexion au changement de nom : points OAuth déduits de l'émetteur, et `iss` (RFC 9207) exigé et vérifié par `assertCallbackIssuer` avant l'échange du code. Aucun changement de code dans les produits.

`@hgdc/config` : `stack.json` fixe la version exacte de chaque paquet `@hgdc/*` du kit, tenue par la release (`scripts/stack-versions.ts`) ; `hgdc-stack sync` les aligne dans les produits.
