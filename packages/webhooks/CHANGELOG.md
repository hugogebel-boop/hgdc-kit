# @hgdc/webhooks

## 0.2.0

### Minor Changes

- cd8872c: `@hgdc/webhooks/safe-fetch` : requête sortante pour Node qui épingle l'adresse vérifiée (plus de rebinding DNS), revérifie chaque redirection et borne délai et taille.

## 0.1.0

### Minor Changes

- 4eaa3bf: Premier envoi : webhooks signés au format Standard Webhooks pour les produits (signature et vérification HMAC-SHA256 avec tolérance sur l'heure, secret `whsec_`, garde SSRF des adresses, calendrier de reprises). Fonctions pures, sans dépendance.
