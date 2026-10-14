# @hgdc/ui

## 0.4.0

### Minor Changes

- 5dcdd02: Composants transverses des consoles, sans dépendance en plus de Base UI : `FilterBar` et `DataTable` (filtres, tri et pagination contrôlés, l'état reste dans l'URL du produit), `DnsRecordTable`, `LogViewer` (niveaux, recherche, suivi en direct, copie, lignes rendues à la demande), `Sparkline`, `MiddleTruncate`, `ErrorCard`, `DestructiveDialog`, `toastUndo` et `errorMessage` dans `sonner`. Les jours de `UptimeBar` s'atteignent au clavier (flèches, Début, Fin). Aucune API existante ne change.

## 0.3.0

### Minor Changes

- 5d5c91b: Coque et composants des consoles HGDC : `AppShell` (barre repliable en rail, tiroir mobile), `OrgSwitcher`, `AccountMenu`, `CommandMenu` (`Ctrl+K`) et `Kbd`, `PageHeader` et fil d'Ariane, `Card`, `Alert`, `Checkbox`, `RadioGroup`, `Tabs`, `Tooltip`, `Popover`, `Table` (tri, ligne cliquable, vide, squelette), `ResourceList`, `StatTile`, `TimeChart` (SVG, sans bibliothèque), `StatusBadge`, `UptimeBar`, `Timeline`, `RelativeTime`, `CopyButton` et `Snippet`, `SecretReveal`, `Skeleton` et `Pending` (délai et durée minimale). Jetons `--chart-1` à `--chart-6` validés pour le daltonisme dans les deux thèmes (`--chart-1` change de valeur), jetons de statut de service et variante `rail:`.

## 0.2.1

### Patch Changes

- 60256e5: Le kit suit l'interface de Host : `SegmentedControl` retrouve son contour, `surface` et `surface-link` reprennent la version de Host, et `--brand-accent` permet de nouveau de poser la couleur d'un client. Un bouton ne grossit plus au survol et sa couleur ne suit plus la courbe à rebond : le libellé ne clignote plus. `Spinner` devient l'anneau de la DA (arc sur une piste, `tone="accent"` seul sur une page, annoncé « Chargement » aux lecteurs d'écran), aussi dans les toasts. Nouveaux jetons `--info` (bleu, le violet reste l'accent) et encres `--status-active-ink`, `--status-paused-ink`, `--info-ink` : les badges atteignent 4,5:1. `--secondary` et `--popover` deviennent des synonymes de `--muted` et `--card`.

## 0.2.0

### Minor Changes

- 87abbcb: Premier contenu de `@hgdc/ui` : `styles.css` (jetons OKLCH, thèmes clair et sombre, polices Inter et Geist, utilitaires de surface et de mouvement) et les primitives communes à HGDC Host et Mail (bouton, champs, menus, boîtes de dialogue, feuilles, badges, toasts, thème), une par sous-chemin (`@hgdc/ui/button`). Un `Button` rendu en lien garde désormais la sémantique d'un lien.

## 0.1.1

### Patch Changes

- 492a6be: Liens vers la documentation et le signalement de faille sur la page npm de chaque paquet. Première version publiée par la CI, avec provenance.
