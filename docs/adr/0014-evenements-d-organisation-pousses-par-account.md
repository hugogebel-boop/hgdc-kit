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
- Endpoint de chaque produit : `POST /hgdc/v1/account-events` sur son déploiement Convex. Signature `v2=` HMAC-SHA256(secret, `v2.<audience>.<id>.<horodatage>.<corps>`), un secret par produit, horodatage à ±5 minutes, comparaison en temps constant, corps lu en flux et plafonné à 8 Ko avant tout calcul. Même modèle que l'API des produits vers Account (sens inverse), mais l'identifiant de l'événement et l'audience (le produit destinataire, `x-hgdc-audience`) entrent dans le MAC : un événement signé pour un autre produit est refusé (401) même si deux secrets se confondaient. Un `occurredAt` à plus de 5 minutes dans le futur est refusé (400).
- Idempotence : le produit enregistre l'identifiant dans la même transaction que l'application (`accountEventsTable`), et ignore un identifiant déjà vu. Les identifiants se purgent après un jour : les essais s'étalent sur 81 minutes et une requête de plus de 5 minutes est refusée.
- Ordre : un événement plus ancien que la dernière confirmation d'Account de l'appartenance (`syncedAt`) est ignoré (`accountEventIsStale`). `syncedAt` est l'`iat` du jeton lu à la connexion (`verifyHgdcIdToken(...).issuedAt`), jamais l'heure de la copie : un jeton émis jusqu'à 10 minutes avant un retrait, lu après, ne masque pas ce retrait. Un changement de rôle appliqué avance `syncedAt` à l'instant de l'événement : un essai en retard d'un rôle antérieur ne l'écrase pas.
- Issue rendue à Account : `applied`, `duplicate` ou `ignored` avec sa raison (`unknown_organization`, `unknown_user`, `not_member`, `stale`), journalisée en avertissement chez le produit. Account remonte à GlitchTip un `member.removed` ignoré pour une autre raison que l'absence d'espace : un retrait qui n'a rien retiré ne passe jamais en silence.
- Le produit applique tel quel : appartenance retirée ou rôle mis à jour ; organisation supprimée, toutes ses appartenances retirées par lots rejouables, jamais les données de l'espace. Mail suspend aussi l'envoi d'un espace dont l'organisation est supprimée (ses clés d'API ne doivent pas continuer sans responsable) et prévient HGDC ; un admin de la plateforme le réactive. Un espace qui perd son dernier propriétaire le reflète aussi (Account fait foi) et le journalise. Les gardes lisent l'appartenance à chaque requête : le retrait coupe l'accès à la requête suivante, et les requêtes Convex abonnées se réévaluent aussitôt.
- Signature et vérification sont dans `@hgdc/auth/events`, en Web Crypto : aucun produit ne recopie ce code.

## Conséquences

- Un retrait s'applique en quelques secondes. Si un produit est injoignable pendant plus de 81 minutes, l'événement est perdu pour lui : la relecture à la connexion et `MEMBERSHIP_TTL_MS` restent le filet.
- Un secret de plus par produit, dans Doppler `hgdc/prd` (`<PRODUIT>_ACCOUNT_EVENTS_SECRET`), posé dans Convex des deux côtés.
- Un événement ne crée jamais d'appartenance : une organisation rejointe arrive toujours par la connexion (ADR 0013).

## Transition vers `v2=` (audience)

`@hgdc/auth` 0.8 signait `v1=` sans audience. Pour passer sans fenêtre de refus : Account envoie d'abord les deux signatures (`legacy`, `v1=` dans `x-hgdc-signature`, `v2=` dans `x-hgdc-signature-v2`), les produits montent ensuite 0.9 qui n'accepte que `v2=`, puis Account retire `legacy`.
