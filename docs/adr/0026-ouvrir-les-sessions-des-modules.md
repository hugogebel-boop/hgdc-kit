---
owner: Hugo Gebel
last_reviewed: 2026-11-11
status: accepted
---

# 0026. Ouvrir en arrière-plan la session des autres modules

## Contexte

Chaque module de Basalte a sa propre session (better-auth par produit, connexion par ID). Mesures du 2026-11-11 sur `app.hgdc.ch`, depuis Déploiements :

| Passage vers Surveillance                                 | Premier octet                        |
| --------------------------------------------------------- | ------------------------------------ |
| Sans session de Surveillance (connexion complète chez ID) | 4,2 s                                |
| Session ouverte (hgdc-kit#338, ADR 0025)                  | 0,58 s, page complète dès le serveur |

La première visite d'un module dans la semaine paie toute la connexion, au clic.

## Décision

La barre de Basalte (`ShellNavigation`) ouvre en arrière-plan la session des autres modules affichés (ceux du projet, servis sous la même origine), 3 s après l'affichage de la page :

- **Entrée** `/<module>/auth/hgdc?frame=open` (`@hgdc/auth`, `HGDC_SESSION_OPEN_PATH`) : session du module ouverte, réponse vide aussitôt, sans appel à ID ; sinon, la connexion HGDC, retour et erreur sur la réponse vide (`frame=done`). Jamais de relecture des organisations, de `next` ni de cookie de relecture. En préchargement (`Sec-Purpose`), 503.
- **Cadre** caché, `sandbox="allow-same-origin"` (ni script, ni formulaire, ni navigation de la page), sans référent, retiré au chargement ou après 20 s.
- **Un module à la fois**, au plus une fois par jour et par module (`localStorage`, `hgdc-session-open:<base>`), jamais sur une page prérendue ni en mode économie de données.
- **Déconnexion** : se déconnecter d'un module (`AccountMenu`) suspend l'ouverture (`hgdc-session-open:paused`) jusqu'à la prochaine connexion par clic (`HgdcSignInButton`, qui demande le choix du compte). Sans cela, la barre rouvrirait le module avec le compte d'ID en cours : un changement de compte ou une déconnexion sur un poste partagé serait défait sans la personne (revue adversariale du 2026-11-11).
- **Sans `localStorage`** (navigation privée stricte, données de site bloquées) : rien ne s'ouvre, faute de limite par jour.
- Si ID demande quelque chose (session d'ID expirée, consentement à donner), il refuse d'être affiché dans un cadre : rien ne se passe, le clic fera la connexion habituelle.

## Conséquences

- Le premier passage vers un module dans la journée trouve sa session : environ 0,6 s au lieu de 4 s.
- Coût : une lecture de session par module et par jour quand elle est ouverte ; une connexion complète chez ID, en arrière-plan, quand elle manque. Une à la fois, pour ne pas déclencher les limites de connexion d'ID.
- Une personne connectée à ID se trouve aussi connectée aux modules affichés de son projet, sans les avoir ouverts. C'est déjà le cas au premier clic (ID ne redemande rien) ; la session d'un module ne donne que les droits de ses organisations.
- La relecture des organisations (`frame=1`, ADR 0016) ne change pas.

## Journal

- 2026-11-11 : `@hgdc/ui` 0.73.0 propagé aux consoles. Mesure en production : premier passage de Déploiements vers Statistiques, jamais ouvert, session ouverte en arrière-plan, 1,4 s au premier octet et page complète dès le serveur (4,2 s avant).
