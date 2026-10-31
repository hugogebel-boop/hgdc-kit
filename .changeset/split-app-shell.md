---
"@hgdc/ui": patch
---

`app-shell.tsx` et `assistant-view.tsx` découpés en modules de moins de 400 lignes (rail, navigation, groupes, accès communs, assistant de la coque, chargement). Aucun changement de comportement ni d'export : les deux fichiers réexportent la même API, le rendu serveur est identique octet pour octet.
