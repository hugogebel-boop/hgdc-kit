# @hgdc/assistant

Le moteur commun de l'assistant IA des produits HGDC. Il vient de l'assistant de Mail, déjà en production, et de celui de Portal, son jumeau : Claude en flux, chez Anthropic ou par OpenRouter selon la clé, des outils typés qui agissent avec les droits de la personne, des cartes à confirmer pour tout ce qui envoie ou détruit, des conversations propres à chaque personne, des crédits mensuels par organisation et la clé propre d'une organisation, scellée.

L'interface est dans `@hgdc/ui/assistant-view` (panneau complet pour la colonne de `AppShell`) et `@hgdc/ui/assistant-chat` (briques). Guide pas à pas avec un exemple complet : [Ajouter l'assistant à un produit](../../docs/guides/ajouter-l-assistant.md).

```sh
bun add @hgdc/assistant @anthropic-ai/sdk
```

`convex` (1.46+) et `@anthropic-ai/sdk` (0.134+, version de la stack) sont des dépendances paires : le produit les a déjà.

| Sous-chemin                 | Contenu                                                                                                                                                                                                                                                                                | Environnement        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@hgdc/assistant/tools`     | `defineTools`, `toolDefinitions`, `parseToolCall` (entrée vérifiée, champ inconnu refusé), `toolResult` (toujours tronqué), `awaitingConfirmation`, `snapshotHash` (SHA-256), types `ToolNamesOf`, `ToolInputOf`                                                                       | partout              |
| `@hgdc/assistant/model`     | `HAIKU_5_5` (modèle et tarifs), `keyProvider`, `readKey`, `requestMicros`, `creditsFromMicros`, `microsFromCredits`, `currentMonth`                                                                                                                                                    | partout              |
| `@hgdc/assistant/secret`    | `sealSecret`, `openSecret` (AES-GCM, clé HKDF du secret du déploiement, données associées liées à l'organisation), `keyHint`                                                                                                                                                           | Convex V8 et Node    |
| `@hgdc/assistant/convex`    | `assistantTables()`, `startTurn` (contrôle et réservation des crédits), `progressMessage`, `finishTurn`, `turnContext`, `readStatus`, `listThreads`, `readThread`, `runReadTool`, `runWriteTool`, `runProposeTool`, `confirmAction`, `cancelAction`, `deleteThread`, clés, crons, nLPD | queries et mutations |
| `@hgdc/assistant/node`      | `runTurn` (la boucle, bornée), `clientFor`, `verifyKey`, `friendlyError`, `failureKind`                                                                                                                                                                                                | action `"use node"`  |
| `@hgdc/assistant/providers` | `MODEL_OPTIONS` (catalogue : fournisseur, lieu de traitement, tarifs), `modelOption`, `isModelId`, `DEFAULT_MODEL_ID`, `PROCESSING_LABEL`, `infomaniakBaseUrl`                                                                                                                         | partout              |
| `@hgdc/assistant/openai`    | `openAIClient` : un point de terminaison au format OpenAI (Infomaniak AI Services) derrière l’interface de `runTurn`, appels d’outils compris                                                                                                                                          | action `"use node"`  |
| `@hgdc/assistant/bedrock`   | `bedrockClient` : Claude par AWS Bedrock (profils `eu.`)                                                                                                                                                                                                                               | action `"use node"`  |

## Ce que le kit impose

- **Aucune fonction Convex publique dans le kit.** Le produit pose sa garde (`requireOrgMember` de `@hgdc/auth/convex`) dans chaque query et mutation, puis passe la personne vérifiée (`{ organizationId, userId }`). Chaque fonction du kit revérifie que la conversation, le message ou l'action appartient à cette personne dans cette organisation.
- **La classe d'un outil décide de son chemin**, pas le produit : `read` passe par `runReadTool` (query), `write` par `runWriteTool`, `confirm` par `runProposeTool`, qui ne reçoit qu'un `ctx` en lecture seule et n'enregistre qu'une carte. L'action n'a lieu que dans `confirmAction`, appelée par la mutation publique de la personne qui clique, après une nouvelle description de la carte et la comparaison de son empreinte SHA-256. Une carte expire après 24 h.
- **Crédits** : une réservation (3 crédits) prise dans la même transaction que le contrôle, ajustée au coût réel à la fin du tour, en micro-dollars entiers ; une réponse jamais finie garde sa réservation comme coût (`failStuckTurns`). Une conversation ne s'efface pas pendant une réponse.
- **Bornes du tour** : 12 étapes, 8 appels d'outils par étape, 8 minutes, 20 000 caractères par résultat d'outil, 700 000 octets d'historique (au-delà, la conversation est pleine).
- **Événements de l'application** (confirmation, annulation, échec) : remis au modèle au tour suivant dans un bloc `<application_events>` séparé, que ni la demande ni un résultat d'outil ne peuvent imiter.

## Données et nLPD

- Les conversations restent dans la base Convex du produit (tables `assistant*`). L'historique part au modèle à chaque tour : demandes, résultats des outils et réponses passent par Anthropic (États-Unis), directement ou via OpenRouter. Chaque produit le dit sur sa page des données.
- `eraseUser` (par lots, à replanifier tant que `done` est faux ; anonymise aussi l'auteur d'une clé) et `exportUser` (conversations et cartes) servent l'effacement et l'export d'une personne ; `purgeIdleThreads` efface les conversations sans activité (90 jours conseillés).
- `TurnResult.failure` donne la nature d'une panne (`api`, `timeout`…) : c'est elle qui se journalise, jamais l'erreur brute du fournisseur ni le texte de la conversation.
