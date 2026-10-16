---
"@hgdc/auth": minor
---

`createSessionTokenCache` : jeton de session du `beforeLoad` racine repris au navigateur pendant 5 minutes, amorcé par le rendu serveur, relu au serveur. Remplace les caches écrits dans chaque produit ; une navigation ne rappelle plus le serveur avant de s'afficher.
