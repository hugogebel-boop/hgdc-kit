---
"@hgdc/assistant": minor
---

`ToolSpec` accepte trois champs facultatifs pour le serveur MCP d'un produit (`@hgdc/api/mcp`) : `title` (nom affiché), `annotations` (surcharge des indications déduites de la classe) et `output` (schéma Zod du résultat, rendu en `outputSchema` et `structuredContent`). L'assistant les ignore : aucun changement pour les produits.
