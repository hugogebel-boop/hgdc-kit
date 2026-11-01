---
"@hgdc/ui": minor
---

`OrgMark` prend la teinte d'avatar de l'identifiant de l'organisation (`id`, sinon le nom) : deux organisations aux mêmes initiales ne se confondent plus. `OrgSwitcher` passe l'identifiant, et la mémoire de la coque retient la teinte pour la première image (`--hgdc-org-bg`, `--hgdc-org-ink`). Dans la barre latérale, le nom de l'organisation tient sur deux lignes au lieu d'être coupé. Nouveaux exports de `@hgdc/ui/initials` : `AVATAR_TONE_CLASSES`, `orgTone`.
