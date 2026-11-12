---
"@hgdc/ui": patch
---

Barre des modules : l'ouverture en arrière-plan des sessions des autres modules ne part plus quand le module ouvert n'a pas de session (démo lue sans compte). Elle lit d'abord `<base>/api/auth/get-session` du module ouvert ; sans session, ou en cas d'erreur, aucun cadre n'est ouvert et la limite par jour n'est pas consommée. `startSessionOpening` et `useSessionOpening` prennent la base du module ouvert en paramètre facultatif ; sans elle, le comportement est inchangé.
