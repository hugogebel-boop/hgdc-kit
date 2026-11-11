---
"@hgdc/auth": minor
---

`@hgdc/auth/core` : l'instantané du cœur peut porter `members` (identifiant chez ID et rôle), et `planMembershipReconcile` dit quelles appartenances locales retirer ou mettre à jour. La relecture rattrape ainsi un retrait de membre dont l'événement s'est perdu. Sans `members`, ou avec une liste vide, rien n'est retiré.
