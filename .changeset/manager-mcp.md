---
"@hgdc/auth": minor
---

`manager` rejoint `MCP_PRODUCTS` : serveur MCP de Manager à `https://app.hgdc.ch/manager/mcp`, scopes `manager:read` et `manager:write`. `createMcpProxy` accepte `convexPrefix` pour un serveur MCP qui partage le déploiement Convex d'un autre produit (Manager sur celui d'ID : `/manager/mcp`).
