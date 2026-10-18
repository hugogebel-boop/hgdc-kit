# @hgdc/assistant

Le moteur commun de l'assistant IA des produits HGDC. Il vient de l'assistant de Mail, déjà en production, et de celui de Portal, son jumeau : Claude en flux, chez Anthropic ou par OpenRouter selon la clé, des outils typés qui agissent avec les droits de la personne, des cartes à confirmer pour tout ce qui envoie ou détruit, des conversations propres à chaque personne, des crédits mensuels par organisation et la clé propre d'une organisation, scellée.

L'interface est dans `@hgdc/ui/assistant-view` (panneau complet pour la colonne de `AppShell`) et `@hgdc/ui/assistant-chat` (briques). Guide pas à pas avec un exemple complet : [Ajouter l'assistant à un produit](../../docs/guides/ajouter-l-assistant.md).

```sh
bun add @hgdc/assistant @anthropic-ai/sdk
```

`convex` (1.46+) et `@anthropic-ai/sdk` (0.133+) sont des dépendances paires : le produit les a déjà.

| Sous-chemin              | Contenu                                                                                                                                                                                                                     | Environnement        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@hgdc/assistant/tools`  | `defineTools`, `toolDefinitions`, `parseToolCall` (entrée vérifiée, champ inconnu refusé), `toolResult`, `awaitingConfirmation`, `fingerprint`                                                                              | partout              |
| `@hgdc/assistant/model`  | `HAIKU_5_5` (modèle et tarifs), `keyProvider`, `readKey`, `requestCost`, `creditsFromCost`, `currentMonth`, `availability`                                                                                                  | partout              |
| `@hgdc/assistant/secret` | `sealSecret`, `openSecret` (AES-GCM, clé dérivée du secret du déploiement et d'un usage), `keyHint`                                                                                                                         | Convex V8 et Node    |
| `@hgdc/assistant/convex` | `assistantTables()` (cinq tables), `startTurn`, `readStatus`, `listThreads`, `readThread`, `proposeAction`, `confirmAction`, `cancelAction`, `deleteThread`, `turnContext`, `patchMessage`, `finishTurn`, `storeKey`, crons | queries et mutations |
| `@hgdc/assistant/node`   | `runTurn` (la boucle), `clientFor`, `verifyKey`, `friendlyError`                                                                                                                                                            | action `"use node"`  |

## Ce que le kit fait, ce que le produit fait

Le kit ne déclare **aucune fonction Convex publique**. Le produit garde la main sur l'entrée :

1. Sa garde (`requireOrgMember` de `@hgdc/auth/convex`) dans chaque query et mutation, puis la personne vérifiée (`{ organizationId, userId }`) passée aux fonctions du kit. Chacune revérifie que la conversation, le message ou l'action appartient à cette personne dans cette organisation : un identifiant venu du navigateur ou du modèle n'ouvre jamais la conversation d'un collègue.
2. Ses outils et leur exécution, avec les droits de la personne qui parle. Un outil `confirm` n'agit jamais pendant le tour : il vérifie que l'action est possible, enregistre une carte (`proposeAction`), et l'action a lieu dans la mutation publique de confirmation, avec la session de la personne qui clique.
3. Sa consigne (`system`), son modèle si ce n'est pas Haiku 5.5, sa limite de crédits.

## Données et nLPD

- Les conversations restent dans la base Convex du produit (tables `assistant*`). L'historique part au modèle à chaque tour : demandes, résultats des outils et réponses passent par Anthropic (États-Unis), directement ou via OpenRouter. Chaque produit le dit sur sa page de données.
- `eraseUser` et `exportUser` servent l'effacement et l'export d'une personne ; `purgeIdleThreads` efface les conversations sans activité (90 jours conseillés) ; `failStuckTurns` clôt une réponse restée en cours plus de 11 minutes.
- Le texte rendu par les outils peut venir de tiers (noms, messages, journaux) : la consigne du produit doit dire que ce sont des données, jamais des instructions. Une image dans une réponse ne se charge pas (`AssistantView` laisse le produit rendre le Markdown : bloquer `img`).
