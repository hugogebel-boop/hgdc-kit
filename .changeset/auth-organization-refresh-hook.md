---
"@hgdc/auth": patch
---

`useOrganizationRefresh(unknown)` (`@hgdc/auth/react`) : sur une page d'organisation inconnue du produit, part une fois vers `/auth/hgdc?refresh=1` et rend `true` le temps de la redirection ; au retour (`synced=1`), rend `false` pour afficher « introuvable ».
