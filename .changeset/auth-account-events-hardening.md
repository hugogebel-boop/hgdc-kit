---
"@hgdc/auth": minor
---

Événements d'Account durcis (ADR 0014, revue adversariale) : signature `v2=` qui couvre l'audience (`audience` obligatoire à la signature et à la réception, `legacy` côté Account pour la transition), corps lu en flux et plafonné (`readBodyText`), `occurredAt` à plus de 5 minutes dans le futur refusé, issue détaillée (`AccountEventOutcome` = `applied`, `duplicate` ou `ignored:<raison>`, `vAccountEventOutcome`, `accountEventOutcomeOf`) journalisée chez le produit, et `verifyHgdcIdToken(...).issuedAt` (iat en ms) à recopier comme `syncedAt`.
