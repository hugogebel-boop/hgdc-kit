---
"@hgdc/ui": minor
"@hgdc/auth": minor
---

Passage d'un produit à l'autre plus rapide sur `app.hgdc.ch`.

- `@hgdc/ui/product-switch` : la relecture des organisations dans un cadre caché part au plus une fois toutes les 10 minutes par produit (`BACKGROUND_REFRESH_INTERVAL_MS`, heure dans `localStorage` sous `hgdc-org-sync:<base>`). Elle refaisait une connexion complète chez ID à chaque changement de produit.
- `@hgdc/ui/products` : avec la dernière organisation ouverte (`lastOrganization()`), la barre des modules mène droit à `/o/<organisation>` du produit (`productEntryHref(word, origins, organization)`, `productEntryQuery`, option `organization` de `shellProductEntries`), sans les redirections de l'accueil. Manager garde son accueil.
- `@hgdc/auth/convex-react` : `HGDC_CONVEX_CLIENT_OPTIONS` (`initialAuthTokenReuse`), à étaler dans le `ConvexQueryClient` de chaque console : le jeton du rendu serveur n'est plus redemandé aussitôt, et les requêtes authentifiées ne sont plus exécutées deux fois.
