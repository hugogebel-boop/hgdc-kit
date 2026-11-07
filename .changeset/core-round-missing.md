---
"@hgdc/auth": patch
---

`runCoreRound` ne compte plus une organisation inconnue du cœur comme un échec : `fetchCoreSnapshot` lève `CoreOrganizationNotFound` sur un 404, et le tour la compte dans `missing` sans s'arrêter.
