---
"@hgdc/auth": minor
---

`@hgdc/auth/mcp` : Account devient le serveur d'autorisation des serveurs MCP des produits (ADR 0009 d'Account). Seule déclaration des produits MCP (`MCP_PRODUCTS`), de leur adresse canonique (`mcpResource`, `MCP_RESOURCES`) et de leurs scopes `<produit>:read|write` (`mcpScopes`, `MCP_SCOPES`, `parseMcpScope`). `verifyMcpAccessToken` vérifie hors ligne un jeton d'accès d'Account pour un produit : RS256 par les clés d'Account (`createHgdcJwks`, cache et relecture limitée), émetteur, audience du produit et rien d'autre, dates, personne, client, organisation (`org_id`), et au moins un scope du produit (`require: "write"` pour une écriture). Un jeton d'un autre produit est refusé même s'il porte un scope du produit (confused deputy, GHSA-p2fr-6hmx-4528). `mcpProtectedResourceMetadata` rend le document RFC 9728 du produit. Web Crypto seulement : tourne dans Convex.
