---
"@hgdc/ui": minor
"@hgdc/auth": minor
---

Vue seule d'un produit sur `<mot>.hgdc.ch` (ADR 0014 de la famille). `@hgdc/ui` : `soloOrigin`, `viewOrigin`, `viewFromHostname`, `soloHref`, `CONSOLE_ORIGINS` (`addresses`), `otherViewHref` (`products`), réglage « Barre des produits » relu chez Account (`product-bar`) ; `AppShell` montre la barre selon la vue et le réglage quand `productRail` est absent, et ajoute « Ouvrir seul » ou « Ouvrir dans app.hgdc.ch ». `@hgdc/auth` : `VIEW_HEADER`, `requestView` ; `createAuthProxy` envoie la vue seule vers l'instance de better-auth montée sous la base et refuse une base doublée en vue `app` ; `createHgdcEntry` reçoit `soloOrigin` ; cookie `hgdc-org-sync` en `Path=/` en vue seule ; `hgdcCookieOptions` et `hostCookiePrefix` pour des cookies better-auth `__Host-hgdc-<mot>.*`.
