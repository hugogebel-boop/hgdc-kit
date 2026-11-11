---
"@hgdc/auth": minor
"@hgdc/ui": minor
---

Ouverture en arrière-plan de la session des autres modules (ADR 0026) : l'entrée accepte `frame=open` (réponse vide si la session est ouverte, sinon connexion HGDC dans le cadre, retour sur `frame=done`) ; la barre de Basalte l'ouvre dans un cadre caché pour chaque module affiché de la même origine, un à la fois, au plus une fois par jour. Le premier clic vers un module trouve sa session.
