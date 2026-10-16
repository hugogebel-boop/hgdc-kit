---
"@hgdc/ui": minor
---

Chargement des pages et menu du compte (demandes de Hugo) :

- `FamilyLoader` : le H se construit sur son fantôme à 15 % (la boucle n'a plus de trou ni de temps mort), apparaît après 120 ms au lieu de 200, et `page` le centre sous l'en-tête en taille `lg` (64 px) par défaut.
- `@hgdc/ui/page-pending` : `PagePending` et `routerPendingDefaults` (`createRouter`, chargement visible après 120 ms, au moins 400 ms) ; `AppShell` accepte `contentKey` (le chemin) pour une frontière `Suspense` par page : plus d'ancienne page figée pendant qu'une page charge ses données.
- `AccountMenu` : la section « Produits » est masquée au-delà de `lg` dans une coque qui affiche la barre des produits (ils y sont déjà) ; gardée sur téléphone et sans barre.
