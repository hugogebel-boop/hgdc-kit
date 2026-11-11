---
"@hgdc/auth": minor
---

`@hgdc/auth/server` : `guardHgdcAccountLink`, garde de `databaseHooks.account.create.before`. Une fiche locale ne se relie qu'à un seul compte ID : better-auth reliait un `sub` inconnu à la fiche de même adresse, si bien qu'une adresse quittée dans ID puis reprise par une autre personne aurait hérité des données de l'ancienne. La liaison est refusée (`HgdcAccountLinkError`) ; la première liaison d'une fiche sans compte ID reste possible. Aussi `assertSingleHgdcAccount`, la règle seule.
