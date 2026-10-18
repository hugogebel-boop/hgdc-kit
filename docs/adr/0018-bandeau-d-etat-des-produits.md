---
owner: Hugo Gebel
last_reviewed: 2026-10-18
status: accepted
---

# 0018. Bandeau d'état dans les produits

## Contexte

Chaque produit de la famille a sa page de statut (`https://status.hgdc.ch/<produit>`), au format Statuspage. Pendant une panne ou une maintenance, la personne connectée au produit ne le sait pas, sauf à aller voir la page.

## Décision

- `@hgdc/ui/service-status` : `useServiceStatus(pageUrl)`, `ServiceStatusBanner`, `ServiceStatus`, et `eventsFromSummary` (pur, testé).
- Lecture de `<page>/api/v2/summary.json` **depuis le navigateur** (CORS ouvert par Status), après le premier rendu, puis toutes les 2 minutes quand l'onglet est visible. Le produit n'attend jamais cette lecture. Une lecture qui échoue, ou un champ d'une autre forme, n'affiche rien : jamais de fausse alerte.
- Ce qui s'affiche : incident ouvert, maintenance en cours, maintenance qui commence dans les 24 h. Les pannes d'abord. Une ligne par événement : point de couleur, nature (« Incident en cours »), titre, détail (« Cause identifiée · mis à jour à 14:15 »), lien « État du service » vers l'événement.
- Le lien d'un événement vient du fichier lu : il n'est gardé que s'il est en `https:` et de la même origine que la page de statut (`safeEventHref`), sinon le bandeau pointe vers la page elle-même.
- Pas de liseré coloré : le point et les mots portent l'état, comme sur les pages de statut.
- Fermable par événement, pour la session (`sessionStorage`). Il revient à la mise à jour suivante (clé : identifiant, statut, date de mise à jour).
- `AppShell` le pose en tête du contenu, d'après son `product`. `statusPage` remplace l'adresse (prévisualisation sur une page de test) ou vaut `false` pour ne rien lire. Docs vit à `/documentation`, puisque `/docs` sert l'aide de Status.

## Conséquences

- Chaque produit qui monte la nouvelle version de `@hgdc/ui` reçoit le bandeau sans code de son côté.
- Les tests qui rendent `AppShell` remplacent `fetch` par une lecture ratée : jamais de réseau en test.
- Le lien « État du service » est dans `AccountMenu` (0.27), tiré du `statusPage` d'`AppShell` : aucun code de produit. `statusPage={false}` le retire avec le bandeau.
