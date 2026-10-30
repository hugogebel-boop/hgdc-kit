---
"@hgdc/auth": minor
---

`viewAuthSites(product, { siteUrl, basePath })` : adresses des deux instances de better-auth d'un produit servi sous `app.hgdc.ch/<mot>` (vue `app` et vue seule sur `<mot>.hgdc.ch`, ADR 0014 de la famille), côté Convex. Origine de la vue seule constante ; instance seule fermée (`soloEnabled: false`) sans la base du produit.
