# @hgdc/ui

## 0.16.0

### Minor Changes

- b67ab8c: `Board` (`@hgdc/ui/board`) : tableau de colonnes dont les cartes se déplacent par leur poignée, à la souris, au doigt ou au clavier (Espace pour saisir, flèches pour déplacer, Espace pour poser, Échap pour annuler), avec annonces pour les lecteurs d'écran. Contrôlé par `onMove`, `canMove` verrouille une carte. Sans dépendance.

## 0.15.0

### Minor Changes

- f719032: Chargeur H refait (ADR 0015) : un seul H par document (`FamilyLoaderRoot`, à poser dans le `body` de la route racine), fixe sur la zone de contenu de la coque, au même pixel dans tous les états (navigation, `PagePending`, `Suspense`, rendu serveur, page d'entrée, autre produit) ; une seule boucle de 2 s pour tout le H (gauche, barre, droite, H complet, fondu), calée sur l'horloge pour que deux pages et deux produits soient en phase ; hors de la coque, le cadre de la coque est dessiné. La zone de contenu réserve sa barre de défilement et la barre latérale se plie dans la même image que la barre des produits s'élargit.

## 0.14.2

### Patch Changes

- db0b77a: `AppShell` : le calque de navigation ne réapparaît plus un instant quand une page qui montrait `PagePending` arrive ; il s'efface derrière `PagePending` (même H, même place) sans revenir.

## 0.14.1

### Patch Changes

- f67d6a8: `shellNavigation` (`@hgdc/ui/page-pending`) : les props `navigating` et `contentKey` d'`AppShell` tirées de l'état de TanStack Router (`useRouterState({ select: shellNavigation })`), sans la recopier dans chaque produit.

## 0.14.0

### Minor Changes

- 7097e19: Chargement des pages refait (retour de Hugo) : `FamilyLoader` montre la silhouette grise du H dont les pièces se remplissent de leurs dégradés (`transform` seul, 1,6 s, phase commune à tous les H ; la prop `delay` disparaît). `AppShell navigating` couvre la zone de contenu du H après 50 ms dès qu'une navigation attend, la coque restant en place ; `PagePending` partage la même place (aucun saut) ; un clic vers un autre produit (barre, menu du compte) couvre aussitôt la zone de contenu. `routerPendingDefaults` ajoute le préchargement au survol (`defaultPreload: "intent"`, `defaultPreloadStaleTime: 0`) et passe à 50 ms / 300 ms.

## 0.13.0

### Minor Changes

- 182d40c: Chargement des pages et menu du compte (demandes de Hugo) :
  
  - `FamilyLoader` : le H se construit sur son fantôme à 15 % (la boucle n'a plus de trou ni de temps mort), apparaît après 120 ms au lieu de 200, et `page` le centre sous l'en-tête en taille `lg` (64 px) par défaut.
  - `@hgdc/ui/page-pending` : `PagePending` et `routerPendingDefaults` (`createRouter`, chargement visible après 120 ms, au moins 400 ms) ; `AppShell` accepte `contentKey` (le chemin) pour une frontière `Suspense` par page : plus d'ancienne page figée pendant qu'une page charge ses données.
  - `AccountMenu` : la section « Produits » est masquée au-delà de `lg` dans une coque qui affiche la barre des produits (ils y sont déjà) ; gardée sur téléphone et sans barre.

## 0.12.2

### Patch Changes

- fd280be: Barre des produits (`ProductRail`, ADR 0011) : elle reste élargie tant qu'un menu ouvert depuis elle est ouvert (sélecteur d'organisation ou tout autre menu, suivi par `aria-expanded` du déclencheur), même quand la souris la quitte pour aller dans le menu ; elle se replie à la fermeture si la souris n'est plus dessus. Le focus rendu au déclencheur après un menu ouvert à la souris ne la garde plus ouverte (seul le clavier compte).

## 0.12.1

### Patch Changes

- 4c91709: `FamilyLoader` s'anime de nouveau en production : la minification de Vite (lightningcss) réduisait le raccourci sans nom `animation: 1.8s infinite both` des pièces à `animation: none`. Chaque pièce porte désormais son animation complète ; un test minifie `styles.css` avec lightningcss et le vérifie. Mouvement réduit inchangé (le H respire).

## 0.12.0

### Minor Changes

- b270863: - Barre des produits : au survol, elle ne recouvre plus la page. La barre latérale se plie le temps du survol et la barre prend sa place (248 px) ; déjà pliée, la barre pousse la page (220 px). Account passe en tête, sous l'organisation. Nouvelle variante CSS `folded:` (pliée par la personne) ; `rail:` vaut aussi pendant le survol. Le pliage de la barre latérale dure 200 ms.
  - Liens vers les produits (`entryHref`, barre et menu) : `/auth/hgdc?refresh=1&next=/`, qui relit les organisations au passage (`PRODUCT_ENTRY_REFRESH_QUERY`). Avant `@hgdc/auth` 0.7, l'entrée ignore `refresh`.
  - `FamilyLoader` (`@hgdc/ui/family-loader`) : chargement de page, le H tricolore qui se construit en boucle, visible après 200 ms.
  - Interrupteur, case à cocher, bouton radio éteints : piste et bords `--control-off`, à 3:1 au moins du fond, d'une carte et de `--muted`, en clair et en sombre. Désactivé : tout l'interrupteur s'estompe.

## 0.11.2

### Patch Changes

- e20962f: `DestructiveDialog` : le champ de confirmation s'annonce « Tape <nom> pour confirmer », sans le libellé du bouton Copier.
- 1d7c53a: `PageHeader` : sans description, les actions s'alignent en haut. Un bouton plus haut que le titre le poussait de 3 px vers le bas ; le titre commence maintenant au même endroit dans tous les produits.

## 0.11.1

### Patch Changes

- dd79dae: `TableHead` : l'icône de tri suit toujours le libellé, colonne de chiffres comprise (« CHF ↕ », plus « ↕ CHF »).

## 0.11.0

### Minor Changes

- 3d260ac: Une seule mise en page pour les consoles (ADR 0012) : `AppShell` pose la marque du produit sur téléphone et la recherche à droite (`onSearch`, 384 px), `mainClassName` est déprécié ; `Page` (colonne de lecture ou `wide`) ; `initials` commun aux personnes et aux organisations ; `RoleBadge` et `MemberItem` ; `Empty variant="card"` ; le badge de `ResourceItem` reste visible sur téléphone ; `Snippet` défile dans une colonne centrée au lieu de déborder ; case à cocher et bouton radio cochés lisibles en thème sombre.

## 0.10.2

### Patch Changes

- 115d511: UptimeBar: the legend under the 90-day bar wraps on narrow screens instead of overflowing.

## 0.10.1

### Patch Changes

- b904cee: Email footer: the link carries "Mail de la H family", so the plain text reads "Envoyé avec Mail de la H family https://mail.hgdc.ch".

## 0.10.0

### Minor Changes

- 2374fd7: AppShell: product rail on the far left (organization, the family's products, Account), widened over the page on hover or keyboard focus; product brand at the top of the sidebar, which becomes the expand button in rail mode; collapse button sized like a nav item. Breaking: `sidebarHeader` is replaced by `product` (required) and `organization`.
  
  Product names drop the "HGDC" prefix everywhere the kit displays them (catalogue `name`, product menu now titled "Produits", product rail, email header); the email footer reads "Envoyé avec Mail de la H family".

## 0.9.0

### Minor Changes

- f537229: Identité H family : `ProductBadge` et `FamilyMark` (`@hgdc/ui/product-badge`), fichiers SVG des pastilles et du logo sous `@hgdc/ui/family/*`, jetons `--product-<mot>-from/to` et `--glow-*`. Le menu « Produits HGDC » d'`AccountMenu` montre la pastille de chaque produit (`badge` sur les entrées de `productMenuEntries` et du catalogue), `CommandMenu` accepte `badge` sur une commande. Icônes des e-mails régénérées depuis les pastilles.

## 0.8.0

### Minor Changes

- 18ed48e: Entrée commune des produits. `@hgdc/auth/server` : `createHgdcEntry`, route serveur `GET /auth/hgdc?next=<chemin>` qui ouvre le produit avec la session HGDC Account (redirection vers `next` si la session du produit existe, sinon connexion HGDC lancée aussitôt, sans page d'accueil ni bouton). `@hgdc/auth` : `HGDC_ENTRY_PATH`, `safeNextPath` (chemin du produit seulement, pas de redirection ouverte) et `hgdcEntryUrl`. `@hgdc/ui/products` : `entryHref` dans le catalogue et `PRODUCT_ENTRY_PATH` ; `productMenuEntries` pointe chaque produit vers son entrée, Account reste sa racine. Chaque produit doit monter la route avant d'adopter cette version de `@hgdc/ui`.

## 0.7.0

### Minor Changes

- 2346727: `@hgdc/ui/access-request` : la page « Demander un accès » commune aux produits (formulaire HGDC Mail Forms en JSON, états envoi, réussite, erreur et champ refusé, lien de connexion du routeur du produit), et `submitAccessRequest` pour un formulaire maison.

## 0.6.0

### Minor Changes

- 55d82ce: Modèle commun des e-mails transactionnels : `@hgdc/ui/email`. `EmailLayout` (icône et nom du produit en tête, accent tiré du catalogue, pied « Propulsé par HGDC Mail » et mentions légales) et les blocs `EmailHeading`, `EmailText`, `EmailLink`, `EmailButton` (lien direct, jamais réécrit), `EmailCode`, `EmailCallout`, `EmailDivider`, `EmailDetails`. `renderEmail(element)` rend `{ html, text }` : tableaux et styles en ligne, 600 px, mode sombre (`color-scheme`, Apple Mail, Outlook), version texte tirée du même rendu. Rendu par React Email : `react-email` 6.11 devient une `peerDependency` facultative, à installer par le produit qui envoie. Icônes PNG des produits dans `@hgdc/ui/email-icons/*`, servies par `https://hgdc.ch/email/<mot>.png`. Le catalogue gagne un champ facultatif `accent` (hex clair et sombre). Aucune API existante ne change.

## 0.5.1

### Patch Changes

- b204752: Catalogue des produits : Portal, Status, Analytics et Docs passent en service.

## 0.5.0

### Minor Changes

- 49ea4ec: Reprend ce que les produits avaient écrit chacun, sans dépendance en plus de Base UI. Catalogue des produits (`@hgdc/ui/products` : `HGDC_PRODUCTS`, `HGDC_ACCOUNT`, `productMenuEntries`), liste par défaut d'`AccountMenu` (prop `product` pour cocher le produit ouvert, `products` la remplace toujours). `SettingsSection` avec son bouton Enregistrer. `StatusBadge` et `StatusDot` acceptent `tone` (`neutral`, `success`, `warning`, `danger`, `info`, `pending`). `CopyButton` à libellé visible (`showLabel`), `CommandMenuButton` compact (`compact`, ou `"mobile"`). Nouveaux : `Progress` et `Meter`, `RankBar`, `DateRangePicker` et `DateTimeField` (champs de date du navigateur), `ColorField` (contraste WCAG), `MoneyField` (CHF en centimes, « 1’250.50 »), `AddressFields` (adresse suisse structurée). `TimeChart` trace en pointillés un dernier point incomplet (`lastIncomplete`). Aucune API existante ne change.

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
