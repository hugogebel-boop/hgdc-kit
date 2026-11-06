---
"@hgdc/auth": patch
---

`@hgdc/auth/core` : les traces de projets retirés ne cachent plus un projet en ligne (index `by_organization` sur `organizationId` et `removedAt`), un logo dont l'hôte finit par un point et un nom avec un séparateur de ligne sont refusés.
