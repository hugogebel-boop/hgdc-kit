---
"@hgdc/ui": minor
---

Passage d'un produit à l'autre sous `app.hgdc.ch` sans rien qui bouge (ADR 0020, point 7) : la barre des produits reste immobile et sans fondu (seul l'indicateur change), le H de chargement continue d'une page à l'autre à la même phase.

- Le cadre du chargeur (`FamilyLoaderRoot`, page qui attend hors de la coque) dessine la coque : barre des produits complète, marque du produit de l'adresse, navigation en squelette, barre du haut (`ShellFrame`).
- `AppShell` sans `organization` tient sa place (`OrgPlaceholder`) avec la marque de la dernière organisation affichée, retenue par `OrgSwitcher` et posée avant la première peinture par `sidebarInitScript` (nouvelle mémoire `@hgdc/ui/shell-memory`). `organization={null}` : rien en haut.
- Transitions de vue : `hgdc-product-rail` et le nouveau `hgdc-loader` sans animation quand ils sont des deux côtés, fondu court d'un seul côté.
- Au clic, la barre se replie sans transition ; la page d'arrivée ne s'élargit pas sous la souris restée dessus.
- La déconnexion par `AccountMenu` oublie l'organisation retenue.
