---
owner: Hugo Gebel
last_reviewed: 2026-10-16
status: accepted
---

# 0014. Événements d'organisation poussés par Account

## Contexte

Un produit recopie les appartenances d'Account à la connexion et par la relecture `refresh=1` (ADR 0013). Un retrait, un changement de rôle ou la suppression d'une organisation dans Account ne s'appliquent donc qu'à la session suivante : jusqu'à 7 jours, 8 avec la marge de `MEMBERSHIP_TTL_MS`. Décision de Hugo : un membre retiré perd l'accès tout de suite.

## Décision

- Account pousse à chaque produit, de serveur à serveur, trois événements : `member.removed` (retrait par un admin, départ volontaire, compte supprimé par HGDC), `member.role_changed` (rôle ramené au plus fort) et `organization.deleted`. Les personnes sont désignées par leur `sub` Account, les organisations par leur `id` Account.
- Envoi par le planificateur d'Account, jamais dans la requête de la personne : un produit en panne ne bloque rien dans Account. Nouveaux essais à 1, 5, 15 et 60 minutes, avec le même identifiant d'événement ; l'échec final remonte à GlitchTip.
- Endpoint de chaque produit : `POST /hgdc/v1/account-events` sur son déploiement Convex. Signature `v1=` HMAC-SHA256(secret, `<id>.<horodatage>.<corps>`), un secret par produit, horodatage à ±5 minutes, comparaison en temps constant, corps plafonné à 8 Ko. Même modèle que l'API des produits vers Account (sens inverse), mais l'identifiant de l'événement entre dans le MAC.
- Idempotence : le produit enregistre l'identifiant dans la même transaction que l'application (`accountEventsTable`), et ignore un identifiant déjà vu. Les identifiants se purgent après un jour : les essais s'étalent sur 81 minutes et une requête de plus de 5 minutes est refusée.
- Ordre : un événement plus ancien que la dernière confirmation d'Account de l'appartenance (`syncedAt`) est ignoré (`accountEventIsStale`). Un changement de rôle appliqué avance `syncedAt` à l'instant de l'événement : un essai en retard d'un rôle antérieur ne l'écrase pas.
- Le produit applique tel quel : appartenance retirée ou rôle mis à jour ; organisation supprimée, toutes ses appartenances retirées, jamais les données de l'espace. Un espace qui perd son dernier propriétaire le reflète aussi (Account fait foi) et le journalise. Les gardes lisent l'appartenance à chaque requête : le retrait coupe l'accès à la requête suivante, et les requêtes Convex abonnées se réévaluent aussitôt.
- Signature et vérification sont dans `@hgdc/auth/events`, en Web Crypto : aucun produit ne recopie ce code.

## Conséquences

- Un retrait s'applique en quelques secondes. Si un produit est injoignable pendant plus de 81 minutes, l'événement est perdu pour lui : la relecture à la connexion et `MEMBERSHIP_TTL_MS` restent le filet.
- Un secret de plus par produit, dans Doppler `hgdc/prd` (`<PRODUIT>_ACCOUNT_EVENTS_SECRET`), posé dans Convex des deux côtés.
- Un événement ne crée jamais d'appartenance : une organisation rejointe arrive toujours par la connexion (ADR 0013).
