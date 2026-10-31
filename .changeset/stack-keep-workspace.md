---
"@hgdc/config": patch
---

`hgdc-stack sync` et `check` laissent les dépendances `workspace:` : épingler un paquet du même dépôt cassait le lockfile (paquet en double).
