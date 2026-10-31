# @hgdc/assistant

## 0.5.0

### Minor Changes

- 0296556: Retire `clientFor` et le fournisseur OpenRouter : les assistants passent par Infomaniak ou Bedrock `eu.` (`sovereignClient`).

## 0.4.1

### Patch Changes

- 1866f4c: Stack : better-auth 1.6.33 (GHSA-qq9h-g4jm-xgf3, prise de compte par un mot de passe posé avant la connexion par lien magique ou code e-mail), zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, mémoire épuisée par un grand tableau). `@better-auth/oauth-provider` et `@better-auth/passkey` entrent dans la stack, à la même version que better-auth. `@hgdc/auth` demande better-auth 1.6.22 au moins ; `@hgdc/auth`, `@hgdc/api` et `@hgdc/assistant` demandent zod 4.6.7 au moins.

## 0.4.0

### Minor Changes

- e2f35ea: Bedrock stays in the EU. `vendorReady("bedrock")` is false (with a warning) when `BEDROCK_REGION` is not in the closed `EU_BEDROCK_REGIONS` list (EU regions and Zurich; not `eu-west-2`, London), so the assistant shows as not connected instead of sending data outside the EU. `modelClient` throws for a non-EU region or a model without the `eu.` inference profile; `bedrockClient` throws for a non-EU region and checks the model on every `messages.stream` call. New helpers: `EU_BEDROCK_REGIONS`, `isEuBedrockRegion`, `isEuBedrockModel`, `assertEuBedrock`.

## 0.3.2

### Patch Changes

- 150f748: `createConsoleRunner` accepts `maxSteps` (model calls per turn, engine default 12).

## 0.3.1

### Patch Changes

- 9cc4326: `runTurn`: default bounds raised to 25 steps and 25 tool calls per step (were 12 and 8), so a grouped request ("one call per item in the same reply") can propose many confirmation cards in one turn.

## 0.3.0

### Minor Changes

- e7db377: `ToolSpec` accepte trois champs facultatifs pour le serveur MCP d'un produit (`@hgdc/api/mcp`) : `title` (nom affiché), `annotations` (surcharge des indications déduites de la classe) et `output` (schéma Zod du résultat, rendu en `outputSchema` et `structuredContent`). L'assistant les ignore : aucun changement pour les produits.
- e35beaa: Modèles en Suisse ou dans l'UE seulement, fabrique des consoles, classe `send` (ADR 0022).
  
  - `@hgdc/assistant/clients` : `sovereignClient()` et `modelClient(option)` (Infomaniak par défaut, Claude par Bedrock `eu.` selon `ASSISTANT_MODEL`). `@hgdc/assistant/providers` : `sovereignReady()`, `platformModel()`, `usProcessingAllowed()`.
  - `clientFor` et `verifyKey` dépréciés : refusés hors développement local, sauf `ASSISTANT_ALLOW_US_PROCESSING=1`. Un produit qui monte de version migre dans la même PR (guide dans l'ADR 0022).
  - `startTurn` et `readStatus` : option `ownKeys: false` (clé propre ignorée, tour toujours réservé).
  - `@hgdc/assistant/console` et `@hgdc/assistant/console/node` : `createConsoleAssistant` et `createConsoleRunner` remplacent la colle répétée des consoles.
  - Classe d'outil `send` (envoi vers l'extérieur, toujours une carte) et marques `private`, `untrusted` : garde « trifecta » par tour dans `runTurn` (`trifecta: "confirm" | "block"`, `taint`), mise en garde `TRIFECTA_DETAIL` sur la carte. `@hgdc/assistant/trifecta` : fonctions pures.
  - `convex.ts` découpé en modules (`convex/`), exports inchangés.

## 0.2.0

### Minor Changes

- b2cdf24: Fournisseurs de modèle pour les données gardées en Suisse ou dans l'UE : catalogue `@hgdc/assistant/providers` (Infomaniak, Claude par Bedrock en UE), client `@hgdc/assistant/openai` qui fait tourner `runTurn` sur une API au format OpenAI, client `@hgdc/assistant/bedrock` (paquet optionnel `@anthropic-ai/bedrock-sdk`).

## 0.1.0

### Minor Changes

- e2b8dfa: Premier envoi : le moteur commun de l'assistant IA, repris de Mail et Portal. Outils typés (lecture, écriture, à confirmer) vérifiés avant exécution, boucle Claude Haiku 5.5 en flux chez Anthropic ou par OpenRouter, tables et fonctions Convex (conversations propres à la personne, cartes à confirmer avec empreinte, crédits mensuels par organisation, effacement et export nLPD), clé de l'organisation scellée en AES-GCM.
