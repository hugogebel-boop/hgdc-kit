---
owner: Hugo Gebel
last_reviewed: 2026-10-29
status: accepted
---

# 0022. Assistant : modèles souverains seulement, fabrique des consoles, classe `send`

## Contexte

L'[ADR 0019](0019-assistant-commun.md) a mis l'assistant des produits dans `@hgdc/assistant`, avec Claude chez Anthropic ou par OpenRouter (`clientFor`). Depuis, la famille a décidé (ADR 0011 du dépôt privé) que les données des clients sont traitées en Suisse (Infomaniak) ou dans l'UE (Claude par AWS Bedrock, profil `eu.`), jamais aux États-Unis. Portal et IAssistant passent déjà par ces fournisseurs, chacun avec sa copie d'un `modelClient`. Les consoles Host, Analytics, Docs, Status et Account appellent encore `clientFor`.

Trois autres constats :

- `convex.ts` faisait 932 lignes : tables, tours, crédits, cartes, clés, entretien et nLPD dans un seul fichier.
- Host, Analytics et Docs réécrivent les mêmes quinze fonctions Convex et la même action Node : seule la garde, la page ouverte et la consigne changent.
- La classe `confirm` mêlait ce qui détruit et ce qui envoie vers l'extérieur. Or l'envoi est la troisième jambe de la « lethal trifecta » (données privées, contenu non fiable, sortie vers l'extérieur) : il demande une garde à part.

## Décision

### Fournisseurs

- `@hgdc/assistant/clients` : `modelClient(option)` et `sovereignClient()` lisent les variables du déploiement (`INFOMANIAK_AI_TOKEN`, `INFOMANIAK_AI_PRODUCT_ID`, ou `BEDROCK_REGION`, `BEDROCK_API_KEY`) et rendent un client prêt pour `runTurn`, avec le tarif du catalogue. Bedrock reste dans l'UE : une région hors de la liste fermée `EU_BEDROCK_REGIONS` (UE et Zurich, pas Londres) laisse le fournisseur non branché ; `modelClient` et `bedrockClient` lèvent pour une telle région, et pour un modèle sans profil `eu.` (`bedrockClient` à chaque appel, `assertEuBedrock`). `ASSISTANT_MODEL` choisit le modèle (identifiant du catalogue, défaut `infomaniak/mistral-small-4`). Sans identifiants : `null`, jamais un autre fournisseur.
- `@hgdc/assistant/providers` gagne `sovereignReady()` (une query sait si un modèle est branché), `platformModel()`, `usProcessingAllowed()`.
- `clientFor` et `verifyKey` sont dépréciés. Hors développement local (`CONVEX_CLOUD_URL` en `http://127.0.0.1` ou `localhost`), `clientFor` lève une erreur et `verifyKey` refuse toute clé, sauf drapeau explicite `ASSISTANT_ALLOW_US_PROCESSING=1`.
- `startTurn`, `readStatus` acceptent `ownKeys: false` : une clé propre encore enregistrée est ignorée, chaque tour est réservé sur le modèle de la plateforme. Défaut `true` pour ne rien changer aux produits qui n'ont pas migré ; la fabrique pose `false`.
- Noms vérifiés le 2026-10-28 : `mistralai/Mistral-Small-4-119B-2603`, `Qwen/Qwen3.5-397B-A17B-FP8`, `swiss-ai/Apertus-v1.5-70B` (page des modèles d'Infomaniak) ; `eu.anthropic.claude-haiku-5-5`, `eu.anthropic.claude-sonnet-5-5` (fiches des modèles Claude sur Bedrock : sans date ni `-v1:0` depuis Claude 5).

### Découpage

`convex.ts` ne fait plus que réexporter : `convex/schema.ts` (tables et validateurs), `context.ts` (`ctx`, constantes, textes), `threads.ts` (conversations et tours), `credits.ts`, `actions.ts` (outils et cartes), `keys.ts`, `purge.ts`, `privacy.ts` (nLPD). Un test fige la liste des exports.

### Fabrique

- `createConsoleAssistant({ builders, guard, tools, read, write, confirm, page })` (`@hgdc/assistant/console`) déclare les fonctions publiques (`status`, `threads`, `thread`, `send`, `confirm`, `cancel`, `remove`) et internes (`context`, `progress`, `finish`, `runRead`, `runWrite`, `runPropose`, `sweep`, `purge`, `eraseOf`, `exportOf`). Chaque fonction publique passe d'abord par `guard.speaker`, la garde du produit ; le kit garde ses revérifications.
- `createConsoleRunner({ internalAction, tools, system })` (`@hgdc/assistant/console/node`) déclare l'action du tour, sur `sovereignClient()`.
- Les références entre fonctions passent par leur nom (`assistant:purge`, `assistantNode:run`, `makeFunctionReference`) : aucune dépendance de type circulaire avec `internal`.
- La fabrique est un raccourci, pas une obligation : les fonctions de `@hgdc/assistant/convex` restent publiques pour une console qui sort du modèle.

### Classe `send` et garde « trifecta »

- `send` : envoi vers l'extérieur (e-mail, webhook, message). Comme `confirm`, il ne passe que par `runProposeTool` et `confirmAction` ; `runWriteTool` le refuse.
- Un outil se marque `private` (données privées de l'organisation) ou `untrusted` (contenu de tiers). `runTurn` suit ce que le tour a lu, même quand l'outil échoue. Après les deux, la carte d'un `send` porte la mise en garde `TRIFECTA_DETAIL` (affichée, hors empreinte) ; `trifecta: "block"` refuse l'appel. `taint` pose l'état de départ (une demande de visiteur anonyme est non fiable). Fonctions pures dans `@hgdc/assistant/trifecta`.
- La garde vaut pour un tour. L'historique des tours précédents reste dans le contexte du modèle : la carte reste la vraie barrière.

## Options écartées

- **Garder `clientFor` pour les consoles internes** : leurs conversations contiennent aussi les données des clients (journaux, statistiques, documents).
- **Supprimer `clientFor`** : casse le développement local sans compte Infomaniak. Il reste, refusé en ligne.
- **Un composant Convex** pour la fabrique : mêmes raisons que dans l'ADR 0019, les outils lisent les tables du produit.
- **Rendre `send` exécutable directement quand le tour est propre** : la règle « tout envoi se confirme » est plus simple à relire ; IAssistant garde ses actions directes réglées par l'entreprise, hors de cette classe.

## Conséquences

- Version mineure de `@hgdc/assistant`. Un produit qui monte de version sans migrer garde son code, mais `clientFor` lève une erreur en production : la migration se fait dans la même PR.
- Variables à poser par produit (Doppler `hgdc/prd`, puis `npx convex env set`) : `INFOMANIAK_AI_TOKEN`, `INFOMANIAK_AI_PRODUCT_ID` ; à retirer après la bascule : `ASSISTANT_LLM_API_KEY`.
- Les pages des données des produits nomment Infomaniak (Suisse) à la place d'Anthropic et OpenRouter (États-Unis).

## Migration, produit par produit

Le plus court, sans la fabrique (une action Node et deux lignes Convex) :

```ts
// convex/assistantNode.ts : remplace `const key = …`, `if (!key) …` et `clientFor(key, …)`
const choice = await sovereignClient() // @hgdc/assistant/clients
if (!choice) return await stop("L'assistant n'est pas encore branché.")
const result = await runTurn({ ...choice, system: SYSTEM, … })

// convex/assistant.ts
const platformKey = () => sovereignReady() // @hgdc/assistant/providers
startTurn(ctx, speaker, { …, ownKeys: false }) ; readStatus(ctx, organizationId, { …, ownKeys: false })
```

Avec la fabrique (guide : [Ajouter l'assistant à un produit](../guides/ajouter-l-assistant.md), sections 4 et 5) :

| Produit   | Garde (`guard`)                                                               | Particularités                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host      | `{ teamSlug }` puis `requireTeamAccess`, organisation `organizationKey(team)` | garder son `status` (indice réservé aux administrateurs, `readsLogs`) et `setLogAccess` ; retirer `saveOrganizationKey` et le coffre de la clé          |
| Analytics | `{ organizationId }` puis `requireOrgMember`                                  | `texts` (pas de clé propre à promettre) ; pas de `confirm` ni `cancel` à exporter ; `context` du tour avec l'organisation                               |
| Docs      | `{ organizationId }` puis `requireMember`                                     | `module: "consoleAssistant"`, `runner: "consoleAssistantNode:run"` ; `confirm: confirmHandlers` (fabrique selon la carte) ; garder `publicationOutcome` |
| Status    | `{ organizationId }` puis sa garde                                            | même modèle qu'Analytics                                                                                                                                |
| Account   | `{ organizationId }` puis sa garde                                            | ses outils `confirm` passent tels quels ; ceux qui envoient (invitation) passent en `send`                                                              |

Portal et IAssistant gardent leur moteur (profils `team` et `client`, visiteur anonyme) ; ils peuvent remplacer leur `modelClient` par celui du kit.
