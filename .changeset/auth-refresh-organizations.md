---
"@hgdc/auth": minor
---

Entrée `/auth/hgdc?refresh=1` : relance la connexion HGDC même avec une session produit ouverte, pour relire le claim `organizations` (une organisation rejointe dans Account apparaît sans attendre la session suivante, ADR 0013). Retour vers `next?synced=1`, sans boucle. Nouveaux : `HGDC_ENTRY_REFRESH_PARAM`, `HGDC_SYNCED_PARAM`, `hgdcRefreshPath`, `hasSyncedMarker`, `withSyncedMarker`, `withoutSyncedMarker`, et `hgdcEntryUrl(origin, next, { refresh: true })`.
