---
"@hgdc/auth": minor
---

Temps 4 de l'ADR 0015 de la famille : `HGDC_ISSUER` vaut `https://id.hgdc.ch/api/auth`. Les produits ouvrent l'autorisation, échangent le code et lisent les clés (`HGDC_JWKS_URL`) sur `id.hgdc.ch`, et leurs documents de ressource MCP (RFC 9728) annoncent ce nom. L'ancien nom devient `HGDC_LEGACY_ISSUER` et reste accepté (`HGDC_ACCEPTED_ISSUERS`) jusqu'à la fin de la fenêtre (temps 5). `HGDC_ID_ISSUER` est gardé comme alias de `HGDC_ISSUER`.
