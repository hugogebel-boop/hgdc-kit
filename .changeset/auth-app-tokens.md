---
"@hgdc/auth": minor
---

Ouvrir le Convex d'un produit à l'app de bureau. `appAuthProviders(env)` déclare l'id_token qu'Account émet pour l'app (`customJwt` RS256, audience `HGDC_APP_CLIENT_ID`) ; `appAccess(env, resolveUser)` et l'option `app` de `requireOrgMember` et du nouveau `requireUser` traduisent son identifiant Account en utilisateur du produit (`hgdcAccountLookup`, `userIdOfAccount`) ; `identity.subject` reste celui du produit, l'identifiant Account passe dans `accountUserId`. `HGDC_ISSUER` doit être en https. Nouvelle raison `unknown_user` (`UNAUTHENTICATED`) pour une personne jamais connectée au produit ; `OrgAccess.via` dit d'où vient la requête. Sans `HGDC_APP_CLIENT_ID`, rien ne change.
