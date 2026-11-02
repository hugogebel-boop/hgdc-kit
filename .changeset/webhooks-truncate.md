---
"@hgdc/webhooks": minor
---

`safeFetch` : option `overflow: "truncate"` qui coupe un corps trop long à `maxBytes` (lu en flux) et rend la réponse avec son statut et `truncated: true`, au lieu de lever `too_large`.
