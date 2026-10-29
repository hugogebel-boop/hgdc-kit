---
"@hgdc/assistant": minor
---

Modèles en Suisse ou dans l'UE seulement, fabrique des consoles, classe `send` (ADR 0022).

- `@hgdc/assistant/clients` : `sovereignClient()` et `modelClient(option)` (Infomaniak par défaut, Claude par Bedrock `eu.` selon `ASSISTANT_MODEL`). `@hgdc/assistant/providers` : `sovereignReady()`, `platformModel()`, `usProcessingAllowed()`.
- `clientFor` et `verifyKey` dépréciés : refusés hors développement local, sauf `ASSISTANT_ALLOW_US_PROCESSING=1`. Un produit qui monte de version migre dans la même PR (guide dans l'ADR 0022).
- `startTurn` et `readStatus` : option `ownKeys: false` (clé propre ignorée, tour toujours réservé).
- `@hgdc/assistant/console` et `@hgdc/assistant/console/node` : `createConsoleAssistant` et `createConsoleRunner` remplacent la colle répétée des consoles.
- Classe d'outil `send` (envoi vers l'extérieur, toujours une carte) et marques `private`, `untrusted` : garde « trifecta » par tour dans `runTurn` (`trifecta: "confirm" | "block"`, `taint`), mise en garde `TRIFECTA_DETAIL` sur la carte. `@hgdc/assistant/trifecta` : fonctions pures.
- `convex.ts` découpé en modules (`convex/`), exports inchangés.
