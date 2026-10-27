# @hgdc/assistant

## 0.2.0

### Minor Changes

- b2cdf24: Fournisseurs de modèle pour les données gardées en Suisse ou dans l'UE : catalogue `@hgdc/assistant/providers` (Infomaniak, Claude par Bedrock en UE), client `@hgdc/assistant/openai` qui fait tourner `runTurn` sur une API au format OpenAI, client `@hgdc/assistant/bedrock` (paquet optionnel `@anthropic-ai/bedrock-sdk`).

## 0.1.0

### Minor Changes

- e2b8dfa: Premier envoi : le moteur commun de l'assistant IA, repris de Mail et Portal. Outils typés (lecture, écriture, à confirmer) vérifiés avant exécution, boucle Claude Haiku 5.5 en flux chez Anthropic ou par OpenRouter, tables et fonctions Convex (conversations propres à la personne, cartes à confirmer avec empreinte, crédits mensuels par organisation, effacement et export nLPD), clé de l'organisation scellée en AES-GCM.
