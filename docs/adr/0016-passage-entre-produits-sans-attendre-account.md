---
owner: Hugo Gebel
last_reviewed: 2026-10-17
status: accepted
---

# 0016. Passer d'un produit à l'autre sans attendre Account

## Contexte

La barre et le menu des produits pointaient vers `/auth/hgdc?refresh=1&next=/` (ADR 0013) : chaque passage repartait vers Account même avec une session du produit ouverte, pour relire le claim `organizations`. Mesuré en production le 17.10 (réseau normal, compte de test, session d'Account et du produit d'arrivée ouvertes) :

| Passage         | Avec `refresh=1` : chaîne seule | jusqu'à la page affichée | Sans `refresh=1` : chaîne seule |
| --------------- | ------------------------------- | ------------------------ | ------------------------------- |
| Host → Mail     | 2,4 à 3,1 s                     | 3,0 à 4,2 s              | 0,53 à 0,84 s                   |
| Mail → Status   | 2,0 à 2,6 s                     | 2,7 à 3,9 s              |                                 |
| Status → Portal | 2,1 à 2,9 s                     | 2,7 à 4,2 s              |                                 |

La chaîne `refresh=1` : entrée (connexion OAuth préparée par le serveur, 0,5 à 1,0 s), `authorize` d'Account (0,4 à 0,7 s), retour sur le produit (échange du code, nouvelle session, organisations relues : 1,1 à 1,4 s), puis la page (ADR 0015). Tout cela pour un seul cas : une organisation rejointe dans Account depuis la dernière session du produit. Les retraits et les changements de rôle arrivent déjà par les événements poussés (ADR 0014).

## Décision

- La barre et le menu des produits pointent vers `/auth/hgdc?refresh=background&next=/`.
- L'entrée vérifie la session du produit côté serveur (`get-session` de better-auth, pas la seule présence d'un cookie). Session valide : redirection immédiate vers `next` (filtré par `safeNextPath`), avec un cookie du produit `hgdc-org-sync=1` (60 s, `SameSite=Lax`, `Secure`). Sans session : la connexion HGDC habituelle, qui lit déjà les organisations.
- La racine du document (`FamilyLoaderRoot` de `@hgdc/ui`, montée par chaque produit, donc aussi sur les pages hors de la coque comme « il te faut une organisation ») consomme ce cookie et relit les organisations dans un cadre caché : `/auth/hgdc?refresh=1&frame=1`. C'est la même source que `refresh=1` (connexion à Account, nouvelle session, claim relu par `session.create.before`), sans second chemin de confiance. Le cadre est `sandbox="allow-same-origin"` (ni script, ni formulaire, ni navigation de la page) ; il revient toujours sur `/auth/hgdc?frame=done`, une réponse vide, jamais sur un `next` reçu. Les requêtes Convex abonnées font apparaître l'organisation sans action.
- Le cadre marche parce que tous les produits et Account sont sur `*.hgdc.ch` (même site : les cookies `SameSite=Lax` partent) et que les redirections ne sont pas soumises à `frame-ancestors` : seule la réponse finale l'est. Si la session d'Account a expiré, Account rend sa page de connexion, qu'il refuse d'afficher dans un cadre (`frame-ancestors 'none'`) : rien ne se passe, la session du produit reste celle d'avant. Vérifié en production le 17.10 avec l'entrée actuelle : nouvelle session créée en 3 à 4 s, sans rien à l'écran.
- `refresh=1` garde son sens bloquant pour les pages d'une organisation inconnue (`useOrganizationRefresh`, `hgdcRefreshPath`) et pour les liens « Ouvrir dans … » d'Account après une invitation : la page attend la relecture avant d'afficher « introuvable ».
- Préchargement au survol (Speculation Rules, `prefetch`, `eagerness: moderate`) des liens `https://*.hgdc.ch/auth/hgdc?refresh=background*`, posé par la coque. Le préchargement entre sous-domaines du même site garde les cookies. Une requête `Sec-Purpose: prefetch` (ou `prerender`) ne démarre jamais de connexion : sans session, avec `refresh=1` ou `frame=1`, l'entrée répond 503, que le navigateur jette. Jamais de `prerender` : la page d'arrivée consomme un cookie et ouvre un cadre.
- Un produit encore sur une version antérieure ignore `refresh=background` : il redirige sans relire, le temps de sa montée de version.

## Options écartées

- **Account pousse `member.added`** (même canal signé que `member.removed`). Presque plus besoin de relire, mais un événement créerait alors une appartenance, et l'espace qui va avec, dans chacun des produits, chacun avec son modèle : l'ADR 0014 a choisi qu'un événement ne crée jamais d'accès. Le cadre caché donne la même fraîcheur sans ouvrir ce chemin. À reprendre si un produit doit voir une organisation rejointe sans être ouvert.
- **Relire par le serveur avec le jeton de rafraîchissement** (`offline_access`). Pas de cadre, mais un second chemin de confiance que l'ADR 0013 a écarté, et du code Convex dans chaque produit.
- **Ne relire que si Account signale un changement** (cookie sur `.hgdc.ch`). Rapide et simple, mais une invitation acceptée sur un autre appareil ne serait plus vue depuis la barre.

## Mesures après déploiement (17.10, production)

| Passage         | Sans préchargement : document | Après un survol (préchargé) : document | Page affichée |
| --------------- | ----------------------------- | -------------------------------------- | ------------- |
| Host → Mail     | 0,53 à 0,54 s                 | 0,07 s                                 | 0,62 à 0,68 s |
| Mail → Status   | 0,38 à 0,52 s                 | 0,07 à 0,08 s                          | 0,75 à 0,80 s |
| Status → Portal | 0,53 à 0,58 s                 | 0,08 s                                 | 0,63 à 0,66 s |

« Page affichée » est le temps jusqu'au contenu de la page, données du produit comprises ; la chaîne d'authentification n'en prend plus que la redirection de l'entrée. Invitation acceptée dans Account par un compte sans organisation dans le produit, puis passage par la barre : arrivée en 0,5 à 0,8 s, l'organisation s'ouvre seule 3,4 s (Mail) à 3,8 s (Host) après le clic. Retrait par un admin : la page de l'organisation se ferme aussitôt (ADR 0014).

Les pages « aucune organisation » des produits doivent suivre leur requête abonnée (Mail, Status, Docs le faisaient ; Host et Analytics corrigés) : sans cela, l'organisation relue n'apparaît qu'au rechargement.

## Conséquences

- Passage avec une session ouverte : une redirection de l'entrée et la page, sans Account ; préchargé au survol, la chaîne est déjà faite au clic.
- La relecture coûte toujours un aller-retour vers Account et une session de plus dans le produit, mais en arrière-plan. Une organisation rejointe apparaît quelques secondes après l'arrivée.
- Session d'Account expirée et session du produit ouverte : le passage ne demande plus de se reconnecter à Account (ADR 0013, conséquence levée) ; la relecture attend la prochaine connexion ou la page d'une organisation inconnue.
- `hgdc-org-sync` est lisible en JavaScript et ne porte que `1` : le forger ne fait que lancer une relecture par Account.
