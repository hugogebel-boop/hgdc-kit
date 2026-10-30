---
"@hgdc/config": minor
"@hgdc/auth": patch
"@hgdc/api": patch
"@hgdc/assistant": patch
---

Stack : better-auth 1.6.33 (GHSA-qq9h-g4jm-xgf3, prise de compte par un mot de passe posé avant la connexion par lien magique ou code e-mail), zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, mémoire épuisée par un grand tableau). `@better-auth/oauth-provider` et `@better-auth/passkey` entrent dans la stack, à la même version que better-auth. `@hgdc/auth` demande better-auth 1.6.22 au moins ; `@hgdc/auth`, `@hgdc/api` et `@hgdc/assistant` demandent zod 4.6.7 au moins.
