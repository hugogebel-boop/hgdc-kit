---
"@hgdc/ui": minor
---

Responsive et tactile, d'après les audits du 2026-10-18.

- Champs (`Input`, `Textarea`, `Select`) à 16 px à toutes les largeurs : plus de zoom au focus sur iPad. Filet des champs et des cases de code au jeton `control-off` (3:1 du fond, WCAG 1.4.11).
- `touch-target` et `touch-field` valent pour tout pointeur grossier (`pointer: coarse`), sans condition de survol ni de largeur : iPad en paysage compris. Nouvelle variante `coarse:`.
- 44 px au doigt : entrées de la barre latérale et du tiroir, barre des produits, `OrgSwitcher`, boutons de la barre latérale, entrées de `DropdownMenu` (simples, radio, sous-menu) et de `Select`, palette, préréglages de `DateRangePicker`, fil d'Ariane, `Switch`, poignée du `Board`, en-têtes de tri de `Table`.
- `ResourceItem` : badge et actions passent sous le titre quand la ligne est étroite (téléphone, texte agrandi) ; la méta tient sur deux lignes avant d'être tronquée.
- `Board` : une carte tenue près du bord fait défiler le tableau (`edgeScrollSpeed`), la carte fantôme reste dans l'écran.
- `TabsList` : le bord s'efface en dégradé du côté où il reste des onglets (`scroll-fade-x`, `data-overflow-start` / `data-overflow-end`).
- `AppShell` : la barre du haut passe à la ligne à texte agrandi au lieu de se chevaucher.
