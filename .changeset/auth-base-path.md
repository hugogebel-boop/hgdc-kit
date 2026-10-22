---
"@hgdc/auth": minor
---

Servir un produit sous un chemin (`https://<hôte>/<produit>`) : option `basePath` de `createAuthProxy` (3e argument), option `appBasePath` de `createHgdcEntry`, option `basePath` de `safeNextPath`, `hgdcEntryUrl`, `hgdcRefreshPath` et `useOrganizationRefresh`, nouveaux `normalizeBasePath` et `withBasePath`. Sans option, rien ne change.
