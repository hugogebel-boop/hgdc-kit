# @hgdc/ui

## 0.52.0

### Minor Changes

- f33ddf8: Bouton « Se connecter avec ID » : fond rouge d'ID, texte blanc (AA), double croix blanche à gauche, états survol, appui, focus visible et désactivé. Nouvelle marque `@hgdc/ui/family/id-mark.svg` (double croix sans fond, pour un fond rouge) ; l'icône d'app reste `family/id.svg`.

### Patch Changes

- f33ddf8: `FloatingField` : rayon des champs du kit (`rounded-2xl`), libellé monté aussi à l'autoremplissage du navigateur (`:autofill`).

## 0.51.0

### Minor Changes

- 931dbb0: Icône d'ID : carte rouge d'ID aux coins arrondis, croix suisse blanche pleine au premier plan (proportions officielles), seconde croix blanche à 40 % décalée de 8 % en diagonale pour l'ombre. Remplace la croix sur fond transparent. Favicons, icônes d'application, tuile et icône d'e-mail régénérés.

## 0.50.0

### Minor Changes

- 47cea55: Icône d'ID redessinée : croix suisse blanche au premier plan, même croix en rouge d'ID décalée en diagonale derrière, fond transparent ; contour gris très clair et ombre douce en thème clair. Favicons, icônes d'application, tuile et icône d'e-mail régénérés.

## 0.49.0

### Minor Changes

- 20195a9: `floating-field` : `FloatingField`, champ à libellé flottant pour les écrans de connexion (libellé dans le champ vide, sur le filet au focus ou avec une valeur, en CSS seul ; erreur avec icône citée par `aria-describedby`).

## 0.48.0

### Minor Changes

- f9d05f9: `@hgdc/ui/products` : chaque produit ouvert reçoit `productPage`, l'adresse de sa page sur le site (`https://hgdc.ch/h-collection/<mot>`) ; aucune pour un produit « soon ».

## 0.47.1

### Patch Changes

- 3b608a5: `app-shell.tsx` et `assistant-view.tsx` découpés en modules de moins de 400 lignes (rail, navigation, groupes, accès communs, assistant de la coque, chargement). Aucun changement de comportement ni d'export : les deux fichiers réexportent la même API, le rendu serveur est identique octet pour octet.

## 0.47.0

### Minor Changes

- 70d98f3: Icône du produit « ID » : carré arrondi rouge, croix blanche aux proportions de la croix fédérale (branches 1/6 plus longues que larges), ombre portée et reflet. Jeux d'icônes (SVG clair et sombre, favicon, apple-touch, 192, 512, maskable, e-mail), jetons `--product-id-*`, entrée « ID » du catalogue (à venir).

## 0.46.0

### Minor Changes

- 2c38ede: Vue seule d'un produit sur `<mot>.hgdc.ch` (ADR 0014 de la famille), à adopter produit par produit.
  
  `@hgdc/ui` : `soloOrigin`, `viewOrigin`, `viewFromHostname`, `soloHref`, `CONSOLE_ORIGINS` (`addresses`), `otherViewHref` (`products`), réglage « Barre des produits » relu chez Account (`product-bar`). `AppShell` reçoit `view` : donné, la barre suit la vue et le réglage, et la coque ajoute « Ouvrir seul » ou « Ouvrir dans app.hgdc.ch » ; absent, rien ne change (barre présente).
  
  `@hgdc/auth` : `VIEW_HEADER`, `requestView` ; `createAuthProxy({ soloView: true })` envoie la vue seule vers l'instance de better-auth montée sous la base, refuse une base doublée en vue `app` et tout chemin ambigu (`//`, `%2f`, `%5c`) ; `createHgdcEntry` reçoit `soloOrigin` (exige `appBasePath`), sans lui l'en-tête de vue est ignoré ; cookie `hgdc-org-sync` en `Path=/` en vue seule. Cookies `__Host-` : `hgdcCookieOptions`, `hostCookiePrefix` (seule source du préfixe, Convex et front), `assertHostCookies` (à appeler sur `getCookies(options)`), `withoutShadowCookies` (retire les `__Secure-__Host-*` avant le handler de Start). Ordre : l'edge accepte d'abord `__Host-hgdc-` sur ses relais, puis Convex et le front du produit ensemble.

## 0.45.0

### Minor Changes

- 2f42536: Portal est servi sous `app.hgdc.ch/portal` : `APP_PRODUCTS`, `PRODUCT_ORIGINS` et le menu « Produits » le traitent comme les autres consoles. `portal.hgdc.ch` redirige vers la nouvelle adresse.

## 0.44.0

### Minor Changes

- de39480: IAssistant passe en préversion dans le catalogue de la collection.

## 0.43.0

### Minor Changes

- b2cdf24: IAssistant rejoint les produits servis sous `app.hgdc.ch` (`APP_PRODUCTS`, `PRODUCT_ORIGINS`).
- b2cdf24: IAssistant entre au catalogue (`HGDC_PRODUCTS`), à l'état « Bientôt » : la coque affiche son nom au lieu de « HGDC iassistant », les menus ne l'ouvrent pas encore.
- b2cdf24: Icône d'IAssistant (pictogramme provisoire, deux bulles fuchsia) : `iassistant` rejoint `FAMILY_PRODUCTS`, avec ses icônes d'application et d'e-mail.

## 0.42.0

### Minor Changes

- fc8dbc0: `@hgdc/ui/addresses` : adresses d'un produit déduites de son mot (`productAddresses`, `productBasePath`, `APP_PRODUCTS`, `APP_ORIGIN`), au lieu de variables posées sur Host et Vercel et recopiées dans chaque produit. `PRODUCT_ORIGINS` en est déduit.

## 0.41.0

### Minor Changes

- b34541f: `ChoiceCards` : un choix parmi quelques options riches, en tuiles (groupe radio, deux colonnes sur téléphone). `Steps` : marche à suivre numérotée, une phrase d'action par étape.

## 0.40.0

### Minor Changes

- 1ae2806: La console Status est servie sous `https://app.hgdc.ch/status` : `PRODUCT_ORIGINS` la déclare. `status.hgdc.ch` reste l'adresse des pages publiques et la console de secours.

## 0.39.1

### Patch Changes

- 8fd8b78: Host n'est plus marqué « Préversion » : il sert en production les consoles et les sites de la famille depuis le 2026-10-23.

## 0.39.0

### Minor Changes

- 7b81284: Passage d'un produit à l'autre sous `app.hgdc.ch` sans rien qui bouge (ADR 0020, point 7) : la barre des produits reste immobile et sans fondu (seul l'indicateur change), le H de chargement continue d'une page à l'autre à la même phase.
  
  - Le cadre du chargeur (`FamilyLoaderRoot`, page qui attend hors de la coque) dessine la coque : barre des produits complète, marque du produit de l'adresse, navigation en squelette, barre du haut (`ShellFrame`).
  - `AppShell` sans `organization` tient sa place (`OrgPlaceholder`) avec la marque de la dernière organisation affichée, retenue par `OrgSwitcher` et posée avant la première peinture par `sidebarInitScript` (nouvelle mémoire `@hgdc/ui/shell-memory`). `organization={null}` : rien en haut.
  - Transitions de vue : `hgdc-product-rail` et le nouveau `hgdc-loader` sans animation quand ils sont des deux côtés, fondu court d'un seul côté.
  - Au clic, la barre se replie sans transition ; la page d'arrivée ne s'élargit pas sous la souris restée dessus.
  - La déconnexion par `AccountMenu` oublie l'organisation retenue.

## 0.38.0

### Minor Changes

- 04a4229: La console Docs est servie sous `https://app.hgdc.ch/docs` : `PRODUCT_ORIGINS` la déclare.
- 2ff60ed: Passage d'un produit à l'autre sous `app.hgdc.ch/<produit>` comme dans une seule app (ADR 0020).
  
  - `@hgdc/ui/styles.css` : transitions de vue entre documents (`@view-transition`, même origine). La barre des produits, la barre latérale et la barre du haut restent en place, le contenu passe en fondu de 150 ms. Mouvement réduit : aucune transition.
  - Barre des produits : un produit servi sous la même origine que la page reçoit un lien relatif marqué `data-hgdc-prerender`, prérendu au survol (`PRODUCT_SPECULATION_RULES`, `eagerness: "moderate"`). Les produits encore sur leur sous-domaine restent préchargés comme avant. Le produit courant pointe vers sa base (`/mail/`), plus vers `/`.
  - Une page prérendue attend d'être affichée pour relire les organisations. Le cookie de relecture porte la base du produit et le cadre s'ouvre sous elle (`takeOrgSync`).
  - Le H du départ vers un autre produit apparaît après 100 ms (`PRODUCT_LEAVE_DELAY_MS`) : une page prérendue s'affiche avant, sans H. Au clic, la barre des produits se replie : la page d'arrivée la montre repliée.
  - Groupes repliables de la barre latérale : clé propre au produit (`sidebar-group:<produit>:<titre>`), le thème et la barre réduite restent communs à la famille.
  - `@hgdc/auth` : sous `appBasePath`, le cookie `hgdc-org-sync` est limité à ce chemin et porte ce chemin ; un autre produit de la même origine ne le voit plus.

## 0.37.0

### Minor Changes

- b004e90: La console Host est servie sous `https://app.hgdc.ch/host` : `PRODUCT_ORIGINS` la déclare.

## 0.36.0

### Minor Changes

- d8351d0: Analytics est servi sous `https://app.hgdc.ch/analytics` : `PRODUCT_ORIGINS` le déclare, les menus et la barre ouvrent la nouvelle adresse.
- 205ae24: Mail est servi sous `https://app.hgdc.ch/mail` : `PRODUCT_ORIGINS` le déclare.

## 0.35.0

### Minor Changes

- 7b3f2ec: Catalogue des produits : table `PRODUCT_ORIGINS` (origine et base de chemin par produit, adresse actuelle par défaut), `productOrigin` et `productEntryHref`. `entryHref` suit la table, produit par produit.

## 0.34.0

### Minor Changes

- e74c79a: Les icônes de produit n'ont plus de carré blanc. Le pictogramme clair, inchangé, remplit le cadre dans l'interface, les e-mails et les icônes d'application.

## 0.33.0

### Minor Changes

- 7a68b37: `SidebarNavGroup` accepte `collapsible` : le titre devient une entrée à flèche (avec `icon`) qui déroule ses rubriques. Fermé par défaut (`defaultOpen`), ouvert dès qu'une rubrique est la page ouverte (`active`, ou lu dans les liens après l'hydratation), état mémorisé par navigateur (`storageKey`, par défaut le titre). Bouton natif avec `aria-expanded` et `aria-controls`, animation coupée sous `prefers-reduced-motion`, rubriques toujours visibles en rail.

## 0.32.0

### Minor Changes

- f4a62f9: `SidebarNavBack` et `SidebarNavGroup` pour une navigation imbriquée (retour en tête, groupes titrés) ; `FilterBar` gagne `variant="panel"` (bouton « Filtres » avec compteur, bulle sur ordinateur, feuille du bas sur téléphone), `onResetFilters` et `leading`.
  
  `ProjectSwitcher` accorde un nom féminin (`noun.feminine`) : « Toutes les pages », « Page active », « Nouvelle page ».

## 0.31.0

### Minor Changes

- e2b8dfa: `@hgdc/ui/assistant-view` : le panneau complet de l'assistant pour la colonne de `AppShell` (barre des crédits et des conversations, fil qui suit la réponse, états vide, non branché, crédits épuisés, chargement et erreur, page ouverte en sujet, effacement en deux temps, conversation pleine). Rendu par défaut sûr (`renderPlainText` : texte brut, liens https seulement) et `AssistantLink` pour le Markdown des produits : nouvel onglet sans référent, domaine affiché, `javascript:` et `http:` rendus en texte. `assistant-chat` : pastilles d'outils avec leur icône d'état, carte à confirmer compacte avec « À confirmer » au-dessus du titre.

## 0.30.1

### Patch Changes

- 212704d: TimeChart : le tableau réservé aux lecteurs d'écran n'allonge plus la page (zone blanche sous le graphique) et se limite à un échantillon de 60 mesures.

## 0.30.0

### Minor Changes

- 5434418: `ProjectSwitcher` : prop `noun` (`{ one, many }`, nom masculin) pour choisir autre chose que des projets, par exemple `{ one: "site", many: "sites" }` dans Analytics. Libellés « Tous les sites », « Sites », « Nouveau site » et noms accessibles en conséquence. Par défaut, rien ne change.

## 0.29.0

### Minor Changes

- 627b559: Coque, assistant, menu du compte, avatars et chargeur H, communs à tous les produits.
  
  - `AppShell` : nouvelles props `links` (Documentation, Réglages, État du service, dans cet ordre, juste au-dessus du compte ; chaque accès est une adresse ou `{ render: <Link to="…" /> }`, État du service suit `statusPage` par défaut, `status: false` le retire) et `account` (`AccountMenu`, tout en bas).
  - `AppShell` : nouvelle prop `assistant={{ open, onOpenChange, panel, label?, shortcut? }}`. Bouton Assistant juste à côté de la recherche ; ouvert, une colonne à droite sur le fond de l'application, la page se rétrécit et se réorganise ; sous 1280 px, vue dédiée plein écran avec « Retour à la page ». Échap ferme, le focus est géré, mouvement réduit respecté, le panneau reste monté après fermeture. Le produit passe seulement le corps (conversation et saisie).
  - Migration : `sidebarFooter` est déprécié. Passer `AccountMenu` dans `account`, les liens Docs et Réglages dans `links`, et retirer l'ancien lien vers l'assistant du bas de la barre. Sans `account`, `sidebarFooter` reste rendu tel quel, sous l'accès État du service.
  - `AccountMenu` : identité (avec l'avatar) en tête, puis Profil, Sécurité, Thème (Système, Clair, Sombre, choix actif en encre pleine), entrées du produit, Se déconnecter à part. Plus d'entrée « État du service » (dans la barre) ni « Raccourcis clavier » (la touche `?` reste au produit) : `statusPage` et `onShortcuts` sont dépréciés et ignorés.
  - Avatars : `AvatarFallback` colore les initiales d'une des sept teintes des icônes des produits, stable par `colorKey` (identifiant ou adresse e-mail, sinon le texte), contraste de 4,5:1 au moins en clair et en sombre ; `colorKey={null}` garde le gris. Nouveau `avatarTone(key)` dans `@hgdc/ui/initials`. `AccountMenu` et `MemberItem` s'en servent.
  - `FamilyLoader` : un seul H, sans reflet ni ombre, recentré ; en mouvement réduit, le H plein immobile.

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
