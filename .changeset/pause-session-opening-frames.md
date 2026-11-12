---
"@hgdc/ui": patch
---

`pauseSessionOpening` retire les cadres d'ouverture de session en cours, et `startSessionOpening` vérifie la pause avant chaque cadre : une déconnexion pendant la file ne laisse plus un module rouvrir sa session juste après.
