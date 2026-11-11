---
"@hgdc/auth": patch
---

`HGDC_RATE_LIMIT` ne limite plus les lectures de session `/get-session` et `/ok` (`SESSION_READ_PATHS`, exporté). Chacune passait d'abord par une lecture et une écriture de la table `rateLimit` de better-auth, environ 150 ms sur edge à chaque page de console, avec une ligne par adresse disputée par les appels parallèles. Rien n'y est à deviner : la session vient d'un cookie signé, comme `/convex/token`.
