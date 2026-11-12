---
"@hgdc/ui": patch
---

Barre des modules : l'ouverture en arrière-plan des sessions des autres modules n'ouvre plus de cadre pour rien.

- Avant chaque module, sa session est lue (`<base>/api/auth/get-session`, même origine). Déjà ouverte : aucun cadre, la limite du jour est marquée. Lecture en échec : aucun cadre, la limite n'est pas consommée. Le cadre ne s'ouvre que pour un module sans session.
- Rien ne part quand le module ouvert n'a pas de session (démo lue sans compte). `startSessionOpening` et `useSessionOpening` prennent la base du module ouvert en paramètre facultatif ; `ShellNavigation` la donne.
- Une déconnexion pendant une lecture arrête la file, comme entre deux cadres.
