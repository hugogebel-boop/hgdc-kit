---
"@hgdc/auth": minor
---

Relais partagé du serveur MCP d'un produit : `createMcpProxy` dans `@hgdc/auth/server`, qui ne transmet que les en-têtes du protocole, retire `set-cookie`, plafonne le corps à 1 Mio et signe l'adresse du visiteur.
