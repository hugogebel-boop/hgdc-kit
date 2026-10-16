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

## Chargement d'une page (2026-10-16)

Changer de page ne garde jamais l'ancienne page figée : dès qu'une navigation attend ses données plus de 120 ms, la zone de contenu (la coque reste en place) montre le H de la famille centré sous l'en-tête (`PagePending`, `@hgdc/ui/page-pending`), au moins 400 ms pour ne pas clignoter, puis la nouvelle page. Deux réglages communs à chaque produit : `routerPendingDefaults` dans `createRouter` (le défaut de TanStack Router attend 1 s), et `contentKey={location.pathname}` sur `AppShell`, une frontière `Suspense` neuve par page qui couvre les données chargées dans les composants (`useSuspenseQuery`), qu'une navigation en transition React aurait sinon cachées derrière l'ancienne page. Les petits états (boutons, lignes) gardent `Spinner`.
