---
owner: Hugo Gebel
last_reviewed: 2026-10-16
status: accepted
---

# 0012. Une seule mise en page pour les consoles

## Contexte

La vérification visuelle des sept produits en production a montré la même coque (`AppShell`, ADR 0011) posée de sept façons. La recherche était à droite dans Account, Host, Mail et Docs, à gauche dans Status, Portal et Analytics, et mesurait 181 px dans Account contre 384 px ailleurs. Le titre de la page commençait à 464 px du bord dans Account (`max-w-4xl`), 400 px dans Docs (`max-w-5xl`) et 352 px ailleurs. Sur téléphone, seul Account affichait la marque du produit. Les initiales d'une même organisation différaient d'un écran à l'autre (« TE » dans le sélecteur, « TV » dans la liste des membres), le badge de rôle était bleu dans Host et gris ailleurs, et disparaissait sous `sm`.

## Décision

- **Barre du haut** : la coque la compose. Sur téléphone, menu, puis la marque du produit (pastille et mot), toujours. Ensuite le contexte du produit (`header` : sélecteur de projet, rappel), à gauche. La recherche passe par `onSearch` et la coque la pose toujours à droite, 384 px sur ordinateur, la loupe seule sous `lg`. Un produit ne pose plus `CommandMenuButton` lui-même.
- **Contenu** : la coque pose la même boîte partout (`max-w-6xl`, marges `px-4` / `sm:px-6` / `lg:px-10`). `mainClassName` est déprécié : aucun produit ne change cette boîte, le titre commence donc au même endroit dans les sept.
- **Largeur d'une page** : `Page` (`@hgdc/ui/page-header`) choisit sa colonne, alignée à gauche. Par défaut, une colonne de lecture de 768 px (`max-w-3xl`) : formulaires, réglages, fiches, membres. `wide` pour les tableaux, les listes à colonnes, les tableaux de bord et les grilles de cartes. La variante large est explicite, jamais un oubli.
- **Initiales** : une seule fonction, `initials` (`@hgdc/ui/initials`), pour une personne comme pour une organisation : la première lettre des deux premiers mots.
- **Rôle** : `RoleBadge`, neutre et monochrome, et `MemberItem` pour une ligne de membre. `ResourceItem` garde son badge sur téléphone.
- **État vide** : `<Empty variant="card">` pour une page sans contenu, la même carte partout ; icône monochrome (`EmptyMedia variant="icon"`), l'accent violet reste au focus, aux liens et à l'élément actif.

## Conséquences

- Chaque produit monte `@hgdc/ui` 0.11 : il remplace son `CommandMenuButton` par `onSearch`, retire `mainClassName`, sa marque mobile et ses fonctions d'initiales, et passe ses variantes locales de page, de badge de rôle et d'état vide sur celles du kit.
- Une page étroite qui contient un tableau devient `wide` ; un formulaire en pleine largeur passe dans la colonne de lecture.

## Chargement d'une page (2026-10-16, révisé le même jour)

Première version écartée par Hugo en prod : le H apparaissait tard, se voyait à peine, sautait d'une position à l'autre, et rien ne bougeait au clic vers un autre produit. Règles retenues :

- **La coque ne se démonte jamais entre deux pages d'un produit** : elle vit dans la route de mise en page (`/o/$org`), et le `beforeLoad` de la racine ne rappelle plus le serveur à chaque navigation (`createSessionTokenCache` de `@hgdc/auth`). TanStack Router n'affiche aucun chargement pendant un `beforeLoad` : un aller-retour là figeait l'ancienne page.
- **Préchargement au survol** (`defaultPreload: "intent"`, `routerPendingDefaults`) : la plupart des pages s'ouvrent sans attente.
- **Retour immédiat** : `AppShell navigating` (état du routeur) couvre la zone de contenu d'un calque opaque avec le H centré après 50 ms, au moins 300 ms, quoi qu'il attende (session, loaders, code). Une page qui lit ses données dans ses composants montre `PagePending` dans la frontière `Suspense` par page (`contentKey`) : toutes les navigations passent par `startTransition`, et seule une frontière neuve montre son repli au lieu de garder l'ancienne page.
- **Une seule place pour le H** : calque de la coque et `PagePending` partagent la même géométrie (sous l'en-tête, centré dans la hauteur visible, `sticky`), et tous les H battent en phase sur l'horloge du document : passer de l'un à l'autre ne se voit pas.
- **Vers un autre produit** (barre des produits, menu du compte) : la coque se couvre du H dès le clic, avant que le navigateur ouvre l'autre domaine ; le produit d'arrivée rend sa coque dès le rendu serveur.
- **Le chargeur** : silhouette grise du H toujours visible (lisible en clair et en sombre), les pièces se remplissent de leurs dégradés l'une après l'autre puis se vident, 1,6 s, `transform` seul (compositeur, fluide pendant que la page charge). Mouvement réduit : la silhouette reste, le remplissage pulse.
