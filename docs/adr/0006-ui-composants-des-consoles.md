---
owner: Hugo Gebel
last_reviewed: 2026-10-15
status: accepted
---

# 0006. `@hgdc/ui` : coque et composants des consoles, sur Base UI seul

## Contexte

Host, Mail et les consoles à venir partagent la même coque (barre latérale, organisation, compte, palette de commandes) et les mêmes briques (tableaux, métriques, statuts, graphiques). Jusqu'à la 0.2, chaque produit les écrivait : la coque vivait dans Host, les tableaux et les cartes KPI dans portal-v2, avec des écarts déjà visibles (onglets bordés, info-bulles avec contour, statut en couleur seule).

## Décision

- **Une seule bibliothèque de primitives : Base UI.** La palette de commandes est l'`Autocomplete` de Base UI rendu dans un `Dialog`, comme l'exemple « Command palette » de sa documentation. Pas de `cmdk` ni de Radix : deux familles de primitives, c'est deux façons de gérer le focus et deux jeux d'attributs `data-*`.
- **Graphiques en SVG maison**, sans Recharts ni autre bibliothèque : `TimeChart` (lignes, aire, barres empilées) et `UptimeBar` couvrent les besoins des consoles. Le SVG s'étire (`preserveAspectRatio="none"`, traits en `non-scaling-stroke`), les textes restent en HTML. Lecture au clavier comme un curseur (`role="slider"`), tableau des données pour les lecteurs d'écran.
- **Palette catégorielle de six teintes** (`--chart-1` à `--chart-6` : bleu, orange, turquoise, jaune, rose, violet), passée au validateur de la skill `dataviz` : écart entre voisines d'au moins 8,4 pour la protanopie et la deutéranopie (5,8 en tritanopie, thème clair) et de 19 en vision normale, dans les deux thèmes, mesurée sur `surface` (clair) et `card` (sombre). En clair, les teintes 2 à 5 passent sous 3:1 : un graphique porte donc une légende et une info-bulle, jamais la couleur seule.
- **Jetons de statut de service** (`--status-operational`, `degraded`, `outage`, `maintenance`, `unknown`, et leur `-ink`) définis comme alias des couleurs existantes : ils suivent les deux thèmes et une couleur de client sans redéclaration. `StatusBadge` écrit toujours le libellé.
- **Présentationnel** : `AppShell`, `OrgSwitcher` et `AccountMenu` ne dépendent ni du routeur ni de l'authentification. Les liens passent par `render={<Link />}`, les actions par des callbacks. Rôles d'organisation fixés à trois : propriétaire, admin, membre.
- **Rail mémorisé** sur `<html data-sidebar="rail">`, lu par la variante `rail:` déclarée dans `styles.css` et posé avant la première peinture par `sidebarInitScript`.
- **Densité confortable par défaut** (lignes de 44 à 64 px, Host en référence) ; un produit dense resserre par `className`.

## Conséquences

- Un produit qui adopte la coque retire sa copie (`shell/`, `lib/sidebar.ts`) et sa déclaration `@custom-variant rail`, devenue celle du kit.
- `--chart-1` change de valeur (bleu validé au lieu de `oklch(0.62 0.19 256)`) : un produit qui comptait sur l'ancienne teinte la redéclare.
- Un graphique au-delà de six séries regroupe le reste en « Autres » ou se découpe : aucune teinte n'est générée.
- Les comportements que happy-dom ne reproduit pas (navigation aux flèches dans les onglets, positionnement) sont garantis par Base UI ; les tests du kit vérifient rôles, états `aria` et rendu.
- 0.4 complète la liste : `FilterBar` et `DataTable` contrôlés (l'URL reste au produit, le kit rappelle), `ErrorCard` (détail replié par `Collapsible`), `DnsRecordTable`, `DestructiveDialog`, `toastUndo` sur Sonner, `LogViewer` (fenêtrage maison à hauteur de ligne fixe, `ToggleGroup` pour les niveaux), `Sparkline` (tracés partagés avec `TimeChart` dans `chart-path`), `MiddleTruncate` (pur CSS, texte entier dans la page). Toujours aucune dépendance en plus de Base UI.
- `UptimeBar` est un seul arrêt de tabulation : flèches, Début et Fin passent d'un jour à l'autre et ouvrent son infobulle.
- Reste à faire : sélection de lignes dans `DataTable` (actions groupées), `Fieldset` avec son propre bouton Enregistrer, période dans `FilterBar` (un `Select` passé dans `actions` en attendant).
