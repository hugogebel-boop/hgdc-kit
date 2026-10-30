---
"@hgdc/ui": minor
"@hgdc/auth": minor
---

Vue seule d'un produit sur `<mot>.hgdc.ch` (ADR 0014 de la famille), à adopter produit par produit.

`@hgdc/ui` : `soloOrigin`, `viewOrigin`, `viewFromHostname`, `soloHref`, `CONSOLE_ORIGINS` (`addresses`), `otherViewHref` (`products`), réglage « Barre des produits » relu chez Account (`product-bar`). `AppShell` reçoit `view` : donné, la barre suit la vue et le réglage, et la coque ajoute « Ouvrir seul » ou « Ouvrir dans app.hgdc.ch » ; absent, rien ne change (barre présente).

`@hgdc/auth` : `VIEW_HEADER`, `requestView` ; `createAuthProxy({ soloView: true })` envoie la vue seule vers l'instance de better-auth montée sous la base, refuse une base doublée en vue `app` et tout chemin ambigu (`//`, `%2f`, `%5c`) ; `createHgdcEntry` reçoit `soloOrigin` (exige `appBasePath`), sans lui l'en-tête de vue est ignoré ; cookie `hgdc-org-sync` en `Path=/` en vue seule. Cookies `__Host-` : `hgdcCookieOptions`, `hostCookiePrefix` (seule source du préfixe, Convex et front), `assertHostCookies` (à appeler sur `getCookies(options)`), `withoutShadowCookies` (retire les `__Secure-__Host-*` avant le handler de Start). Ordre : l'edge accepte d'abord `__Host-hgdc-` sur ses relais, puis Convex et le front du produit ensemble.
