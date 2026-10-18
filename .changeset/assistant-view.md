---
"@hgdc/ui": minor
---

`@hgdc/ui/assistant-view` : le panneau complet de l'assistant pour la colonne de `AppShell` (barre des crédits et des conversations, fil qui suit la réponse, états vide, non branché, crédits épuisés, chargement et erreur, page ouverte en sujet, effacement en deux temps, conversation pleine). Rendu par défaut sûr (`renderPlainText` : texte brut, liens https seulement) et `AssistantLink` pour le Markdown des produits : nouvel onglet sans référent, domaine affiché, `javascript:` et `http:` rendus en texte. `assistant-chat` : pastilles d'outils avec leur icône d'état, carte à confirmer compacte avec « À confirmer » au-dessus du titre.
