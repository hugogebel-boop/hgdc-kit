---
owner: Hugo Gebel
last_reviewed: 2026-10-16
status: accepted
---

# 0011. Barre des produits et marque du produit dans `AppShell`

## Contexte

Passer d'un produit de la famille à un autre demandait d'ouvrir le menu de l'avatar, en bas de la barre latérale. Les sept produits partagent la même coque (`AppShell`, ADR 0006) et la même entrée (`/auth/hgdc`, ADR 0010) : une barre commune à gauche, à la manière de kSuite, rend la famille visible et le changement immédiat.

Le bouton qui réduit la barre latérale posait deux problèmes. Il était plus petit que les entrées de navigation (32 px contre 36 px de haut), et en rail il passait sous le sélecteur d'organisation, en tête de colonne : la navigation descendait d'une ligne et le bouton n'avait plus d'endroit stable. Ses icônes étaient en plus inversées : les noms de Hugeicons décrivent l'état du panneau, pas le geste.

## Décision

- **Barre des produits** à l'extrême gauche, sur ordinateur seulement (`lg`, le seuil où la coque passe du tiroir à la colonne ; sur téléphone, les produits restent dans le menu de l'avatar). 56 px de large. De haut en bas : le sélecteur d'organisation, les pastilles des produits ouverts du catalogue, puis Account en bas, à part : c'est le compte commun, pas un produit (`HGDC_ACCOUNT`, hors de `HGDC_PRODUCTS`). Pas d'aide en bas : la coque n'en a pas, chaque produit garde ses liens d'aide dans le pied de sa barre.
- **Survol** : après 150 ms d'intention, la barre s'élargit à 220 px **par-dessus** la page (positionnée en absolu dans sa colonne de 56 px, rien ne se décale) et écrit le nom de chaque produit en police de titre. Fermeture dès que la souris sort. Au clavier, le focus d'un lien l'ouvre (`:focus-visible`, pas au clic), `Échap` la referme. Transition CSS de largeur, donc interrompue et reprise sans saut ; aucune sous `prefers-reduced-motion`. Ombre seulement quand elle flotte, filet en sombre.
- **Couleurs** : fond `--shell-rail`, un cran sous la coque. Produit courant en teinte (`--shell-active`, `aria-current="page"`), jamais de contour ni d'accent.
- **Liens** : `https://<mot>.hgdc.ch/auth/hgdc?next=/` pour chaque produit, la racine d'Account (ou `accountHref` en développement), `/` pour le produit courant. Le catalogue (`productRailEntries`) fait foi : un produit « bientôt » n'y apparaît pas.
- **Marque du produit** en tête de la barre latérale (`product`, obligatoire) : pastille et « HGDC <mot> ». Le sélecteur d'organisation quitte la barre latérale pour la barre des produits (`organization`). Il s'y rend compact par un contexte (`ShellPlacementContext`), sans variante à passer.
- **Plier et déplier** : le bouton fait 40 × 36 px, la boîte d'une entrée en rail, icône de 18 px. Dépliée, il reste à droite de la marque. En rail, il ne descend pas : la pastille du produit **devient** le bouton « Déplier » au survol de la barre ou au focus (fondu croisé des deux icônes au même endroit, `aria-label`, infobulle avec le raccourci). Les deux états sont dans la page, choisis par la variante CSS `rail:`, donc justes dès la première peinture. `Ctrl+B` inchangé.
- **`productRail={false}`** coupe la barre des produits pour un écran qui ne doit pas l'avoir ; l'organisation revient alors sous la marque.

## Conséquences

- `sidebarHeader` disparaît d'`AppShell` au profit de `product` et `organization` : chaque produit l'adopte en montant `@hgdc/ui` (version mineure, le kit est en 0.x).
- La barre des produits mène aux autres produits par leur entrée commune : un produit doit monter `/auth/hgdc` (déjà le cas des sept, ADR 0010).
- Sur tablette tactile au-delà de `lg`, la barre ne s'élargit pas (pas de survol) : les pastilles restent cliquables, leur nom est lu par les lecteurs d'écran.
