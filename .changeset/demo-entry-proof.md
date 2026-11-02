---
"@hgdc/auth": minor
---

`@hgdc/auth/demo` : l'entrée de la démo ne transmet plus le secret de relais. Le front envoie `demoEntryRequest(secret, ip)` (clé du visiteur, heure, preuve HMAC-SHA-256), Convex la vérifie avec `takeDemoEntry(args, { secrets: [courant, ancien], limit })` et `args: DEMO_ENTRY_ARGS`. L'ancien secret est accepté pendant une rotation ; une preuve qui ne tient pas laisse entrer sans rien compter. Rupture : `takeDemoEntry` prend `secrets` au lieu de `secret`, et `{ reader, at, proof }` au lieu de `{ relay, reader }`.
