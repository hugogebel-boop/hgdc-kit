# @hgdc/ui

## 0.28.0

### Minor Changes

- 6398c4f: `ProjectSwitcher` et `ProjectMark` (`@hgdc/ui/project-switcher`) : le sélecteur de projet de Host, piloté par props (liens par `renderLink` ou actions), pour tous les produits qui ont des projets. `useCursorPages` (`@hgdc/ui/cursor-pages`) et `CursorPager` (`@hgdc/ui/cursor-pager`) : pagination serveur par curseur, 200 lignes par page, Précédent et Suivant, retour à la première page quand les filtres changent, compatible avec `paginate` de Convex.

## 0.27.0

### Minor Changes

- bcabfd1: `AccountMenu` : entrée « État du service » vers la page de statut du produit, tirée d'`AppShell` (son `statusPage`, sinon `https://status.hgdc.ch/<produit>`, Docs à `/documentation`). Prop `statusPage` pour la remplacer ou la retirer (`false`).
- 24bf922: `UptimeBar` : champ `detail` par jour (durée par niveau, incidents en liens). Le jour ouvre alors une bulle au survol, au toucher ou au clavier, dont les liens se suivent au clavier, au lieu de l'infobulle en texte.

## 0.26.0

### Minor Changes

- f6115ac: `hgdc-brand`, bin qui pose les icônes du kit au build : `hgdc-brand sync <mot>` (favicon et icônes d'application dans `public/`, `--email-as` pour une ancienne adresse d'icône d'e-mail) et `hgdc-brand emails <dossier>` (icônes d'e-mail du site). `@hgdc/ui/email-icon` (`EMAIL_ICON_BASE`, `emailIconUrl`, sans React Email, aussi réexportés par `@hgdc/ui/email`) : `emailIconUrl` ajoute l'empreinte de l'image (`?v=`, `EMAIL_ICON_VERSION`) : les clients mail rechargent une icône qui a changé.

## 0.25.0

### Minor Changes

- 006c605: `AccountMenu` : le thème se choisit par trois icônes (Système, Clair, Sombre) directement dans le menu, à la place de l'entrée « Thème » et de son sous-menu. Le choix ne ferme pas le menu ; flèches gauche et droite pour passer de l'un à l'autre. Le composant est exporté à part : `ThemeSwitch` (`@hgdc/ui/theme-switch`).

## 0.24.0

### Minor Changes

- 532f157: Icônes des produits : une seule tuile, carré blanc arrondi (rayon 14/64) partout, barre, menu du compte, « Propulsé par », e-mails et icônes d'application. Le pictogramme passe à 12 % de marge, centré sur son dessin. `ProductBadge` perd la prop `shape` (à retirer là où `shape="round"` était passé) et `BadgeShape` disparaît. `family/app/<mot>/favicon.svg` est désormais sans fond et passe à la variante sombre sous `prefers-color-scheme: dark` ; la maskable garde le dessin dans la zone sûre. `family/tile/<mot>-round.svg` et `-favicon.svg` sont retirés.

## 0.23.0

### Minor Changes

- 06f660a: `@hgdc/ui/service-status` : bandeau d'état d'un produit, lu depuis `summary.json` de sa page de statut (incident ouvert, maintenance en cours, maintenance dans les 24 h), sans liseré, fermable jusqu'à la mise à jour suivante. `AppShell` le pose en tête du contenu (`statusPage`, `false` pour ne rien lire).

## 0.22.1

### Patch Changes

- 05bc493: `ResourceItem` : à 390 px et texte 200 %, le titre passe à la ligne au lieu d'être tronqué, et badge et actions ne dépassent plus de la carte (le texte d'un bouton d'action peut passer à la ligne).

## 0.22.0

### Minor Changes

- 567a8aa: Responsive et tactile, d'après les audits du 2026-10-18.
  
  - Champs (`Input`, `Textarea`, `Select`) à 16 px à toutes les largeurs : plus de zoom au focus sur iPad. Filet des champs et des cases de code au jeton `control-off` (3:1 du fond, WCAG 1.4.11).
  - `touch-target` et `touch-field` valent pour tout pointeur grossier (`pointer: coarse`), sans condition de survol ni de largeur : iPad en paysage compris. Nouvelle variante `coarse:`.
  - 44 px au doigt : entrées de la barre latérale et du tiroir, barre des produits, `OrgSwitcher`, boutons de la barre latérale, entrées de `DropdownMenu` (simples, radio, sous-menu) et de `Select`, palette, préréglages de `DateRangePicker`, fil d'Ariane, `Switch`, poignée du `Board`, en-têtes de tri de `Table`.
  - `ResourceItem` : badge et actions passent sous le titre quand la ligne est étroite (téléphone, texte agrandi) ; la méta tient sur deux lignes avant d'être tronquée.
  - `Board` : une carte tenue près du bord fait défiler le tableau (`edgeScrollSpeed`), la carte fantôme reste dans l'écran.
  - `TabsList` : le bord s'efface en dégradé du côté où il reste des onglets (`scroll-fade-x`, `data-overflow-start` / `data-overflow-end`).
  - `AppShell` : la barre du haut passe à la ligne à texte agrandi au lieu de se chevaucher.

## 0.21.0

### Minor Changes

- f3170c3: `assistant-chat` : conversation avec un assistant (bulles, réponse rendue par le produit, pastilles des outils, cartes d'action à confirmer, exemples, saisie Entrée/Maj+Entrée), commune à Portal, Mail et Docs.

## 0.20.0

### Minor Changes

- 7681f7e: Product colours follow the site's final palette (host `#3b7bff → #2b63f2`, mail `#fa3a58 → #ec3052`, status `#11ce8b → #09b077`, account `#ff6a3d → #fc582e`, analytics `#ffb020 → #e58309`, docs `#0ec1dc → #0aa3c1`, portal `#8b5cff → #7b4bf7`): `family/` is copied byte for byte from the site, tiles, app icons, email icons, `PRODUCT_GRADIENT` and `--product-*` tokens regenerated; the Account pictogram is the new cut-out avatar. Light stays the default theme when nothing is chosen, and `<meta name="theme-color">` now follows the app's theme instead of the system's (`THEME_COLOR`, rewritten by the anti-flash script and `ThemeProvider`): a dark system no longer paints a dark browser bar over a light page.

### Patch Changes

- b40f537: Barres de défilement fines, visibles seulement quand la souris ou le focus clavier est dans le bloc qui défile.

## 0.19.0

### Minor Changes

- a1d74ba: Product icons sit on a white background, in light and dark alike, with no border or shadow: `ProductBadge` draws a white squircle by default and a white circle with `shape="round"` (« Propulsé par »). `PRODUCT_BADGE_SVG[word]` becomes `{ squircle, round }`, new `BadgeShape` type. `family/tile/` ships the tiles (`<word>.svg`, `-round.svg`, `-favicon.svg` with 22 % corners); `family/app/<word>/` now holds the favicon on a 22 % rounded square, apple-touch and maskable full-bleed white, icon-192/512 as squircles. Email icons are squircles. The H « Double » keeps no background.

## 0.18.0

### Minor Changes

- a059269: H Collection identity (direction G « Sur blanc », H « Double »). `ProductBadge`, `FamilyMark` and `HgdcMark` now carry a light and a dark drawing, chosen by the theme through CSS (`data-mark-theme`, `.dark`). `PRODUCT_BADGE_SVG` and `FAMILY_MARK_SVG` become `{ light, dark }`; `HGDC_MARK_DARK_SVG` is new. `family/` ships `<word>.svg`, `<word>-dark.svg` and `hcollection-icon(-dark).svg`; the old `hfamily*.svg` files are gone. `--product-<word>-from/to` take the new colours, email icons are regenerated. `FamilyLoader` draws the H « Double »: the full H fills on the same single 2 s loop (ADR 0015), its reflection stays still at 35 % (50 % in dark).
  
  `family/app/<word>/` ships each product's app icons, ready to copy into its `public/`: `favicon.svg` (both drawings, follows the system theme), `favicon.ico` (16, 32, 48), `apple-touch-icon.png` (180, on white), `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` (on white, inside the 80 % safe zone).

## 0.17.2

### Patch Changes

- b716ecf: Le pied des e-mails devient « Envoyé avec Mail de la H Collection » (le nom de l'ensemble des produits passe de « H family » à « H Collection »). `FamilyMark` reçoit le libellé « H Collection » dans ses tests.

## 0.17.1

### Patch Changes

- 75640de: La relecture des organisations après un passage depuis la barre part de `FamilyLoaderRoot`, donc de toutes les pages, y compris « il te faut une organisation » hors de la coque : une organisation rejointe dans Account y apparaît sans action.

## 0.17.0

### Minor Changes

- d564264: Passage d'un produit à l'autre sans attendre Account (ADR 0016). La barre et le menu des produits pointent vers `/auth/hgdc?refresh=background&next=/` : avec une session du produit ouverte, l'entrée redirige aussitôt et la coque relit les organisations dans un cadre caché. L'entrée refuse (503) tout préchargement qui démarrerait une connexion, et la coque précharge au survol l'entrée des autres produits.

## 0.16.1

### Patch Changes

- 83c3980: Chargeur H : le calage sur l'horloge ne touche que les animations du H, jamais le fondu d'apparition ou de disparition du chargeur.

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
