---
owner: Hugo Gebel
last_reviewed: 2026-10-16
status: accepted
---

# 0013. Relire les organisations sans attendre la session suivante

## Contexte

Un produit recopie les organisations de la personne depuis le claim `organizations` de l'id_token d'Account, dans `session.create.before` (ADR 0004, README de `@hgdc/auth`). Le claim n'est lu qu'à ce moment : les sessions durent 7 jours sans prolongation, et l'id_token n'est jamais redemandé entre deux. Une personne qui accepte une invitation dans Account ne voit donc pas l'organisation dans un produit déjà ouvert, pendant au plus 7 jours. C'est arrivé en production : invitation acceptée dans Account, aucun accès dans Host.

## Décision

- L'entrée commune `/auth/hgdc` (ADR 0010) accepte `refresh=1` : elle relance la connexion HGDC même si la session du produit est ouverte. Account répond sans formulaire (session d'Account ouverte, client de confiance) ; la nouvelle session relit le claim par le même crochet. Aucun second chemin de confiance : pas d'appel à `userinfo` avec un jeton stocké.
- Retour vers `next?synced=1`. Une page qui voit ce marqueur ne relance pas l'entrée, et l'entrée ignore `refresh=1` quand `next` le porte déjà : une seule resynchronisation par navigation.
- Déclencheurs : les liens de la barre et du menu des produits (`?refresh=1&next=/`, relecture en arrière-plan depuis l'ADR 0016) ; dans chaque produit, une page d'organisation inconnue ou sans appartenance locale, avant « introuvable » (`hgdcRefreshPath`) ; dans Account, après l'acceptation d'une invitation, les liens « Ouvrir dans … ».
- L'ancienne session n'est pas révoquée : si Account est injoignable pendant un changement de produit, la personne garde son accès. Elle expire seule après 7 jours.

## Conséquences

- Passer d'un produit à l'autre coûte trois redirections de plus quand la session du produit existait déjà.
- Si la session d'Account a expiré, changer de produit demande de se reconnecter à Account, même avec une session produit ouverte.
- Chaque changement de produit crée une session de plus dans le produit d'arrivée, jusqu'à leur expiration.
- Un retrait d'Account n'était appliqué qu'à la reconnexion ou à la péremption de l'appartenance (`MEMBERSHIP_TTL_MS`) : depuis l'ADR 0014, Account le pousse aux produits et il s'applique tout de suite.
