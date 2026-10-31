---
owner: Hugo Gebel
last_reviewed: 2026-10-18
status: accepted
---

> Complétée par l’[ADR 0022](0022-assistant-souverain-et-fabrique.md) : modèles en Suisse ou dans l’UE seulement (`clientFor` déprécié), fabrique des consoles, classe `send` et garde « trifecta ».

> **Révisé le 2026-10-31** : OpenRouter et `clientFor` retirés de `@hgdc/assistant` 0.5.0 ; assistants sur Infomaniak ou Bedrock `eu.` seulement.

# 0019. Assistant commun : `@hgdc/assistant` et `@hgdc/ui/assistant-view`

## Contexte

Mail et Portal ont chacun un assistant en production, écrits l'un d'après l'autre : même boucle Claude en flux (SDK officiel d'Anthropic, chez Anthropic ou par OpenRouter selon la clé), mêmes tables (conversations, messages, actions, consommation, clé de l'espace), mêmes cartes à confirmer, mêmes crédits. Les autres produits doivent l'avoir aussi, dans la colonne que `AppShell` réserve depuis 0.29. Copier une troisième fois est exclu par la règle de la famille.

Trois voies étudiées :

1. **Extraire le moteur de Mail dans le kit** (bibliothèque, tables dans la base du produit).
2. **`@convex-dev/agent`** (composant officiel : fils, messages, flux, outils, consommation) avec une interface du kit.
3. **Un composant Convex maison** publié par le kit (tables et fonctions isolées dans le composant).

## Décision

La voie 1 : `@hgdc/assistant`, une bibliothèque, et `@hgdc/ui/assistant-view`, le panneau.

- `@convex-dev/agent` passe par l'AI SDK de Vercel (`ai` 7, fournisseurs, `convex-helpers` 0.1.127+) : trois dépendances de plus à suivre dans la stack, un historique à un autre format (migration des conversations de Mail et Portal), et l'exécution d'un outil approuvé se fait dans une action planifiée avec l'identifiant de la personne, pas dans la mutation de la personne qui clique. Le format de l'API Anthropic gardé tel quel conserve aussi la réflexion, le cache du préfixe et l'entrée d'outils en flux, déjà réglés.
- Un composant maison isolerait les tables, mais les outils lisent les tables du produit : il faudrait des poignées de fonctions dans les deux sens et un code généré de composant dans le kit, pour un gain faible.
- La bibliothèque ne déclare aucune fonction publique : le produit pose sa garde (`requireOrgMember`) et passe la personne vérifiée ; chaque fonction du kit revérifie l'appartenance de la conversation, du message ou de l'action. Un outil `confirm` n'agit jamais pendant le tour : il devient une carte, et l'action a lieu dans la mutation publique de confirmation, avec la session de la personne qui clique et une empreinte du contenu montré.
- La classe d'un outil décide de son chemin : `read` (query), `write`, `confirm` (carte décrite avec un `ctx` en lecture seule, empreinte SHA-256 comparée au clic, expiration à 24 h).
- Crédits réservés au début du tour dans la transaction du contrôle, ajustés au coût réel à la fin, cumulés en micro-dollars entiers ; une réponse jamais finie garde sa réservation comme coût. Bornes du tour : étapes, appels par étape, durée, taille des résultats et de l'historique.
- Revue adversariale du 2026-10-18 (PR #133) intégrée : crédits, classes d'outils, empreintes, bornes, événements de l'application hors du texte, HKDF et données associées pour la clé scellée, tests `convex-test`.
- Modèle par défaut : Claude Haiku 5.5 (`claude-haiku-5-5`, `anthropic/claude-haiku-5.5` par OpenRouter), réflexion adaptative, effort `medium`. 1 crédit = 1 centime de dollar de coût modèle, palier long au-delà de 100 000 jetons d'entrée compté.
- Le kit ne voit jamais une clé : le produit lit la sienne dans son environnement, ou ouvre celle de l'organisation (`@hgdc/assistant/secret`, AES-GCM, clé dérivée de `BETTER_AUTH_SECRET`).

## Conséquences

- Nouveau paquet : son premier envoi sur npm se fait à la main (`docs/runbooks/publier.md`), ensuite par la CI. `@hgdc/ui/assistant-view` part, lui, avec la release normale de `@hgdc/ui`.
- Un produit écrit sa garde, ses outils, sa consigne et des fonctions minces (une garde puis un appel au kit chacune) (guide : `docs/guides/ajouter-l-assistant.md`).
- Mail et Portal gardent leur moteur jusqu'à leur migration (tables `agent*` et `assistant*` à recopier vers `assistantTables()`, organisation au lieu de l'espace) ; ils peuvent prendre `AssistantView` avant.
- `ToolChips` et `AssistantActionCard` changent d'aspect (icône d'état, carte compacte « À confirmer ») : Portal, qui les utilise, en profite sans changer de code.
