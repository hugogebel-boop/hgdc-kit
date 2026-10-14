---
owner: Hugo Gebel
last_reviewed: 2026-10-14
status: accepted
---

# 0005. `@hgdc/ui` : CSS Tailwind livrée brute, un sous-chemin par composant

## Contexte

Host et Mail portaient chacun une copie des mêmes 18 primitives (Base UI, Hugeicons, cva) et un `styles.css` identique à six jetons près. Chaque correction se faisait deux fois, et les copies dérivaient déjà : `Button` en lien corrigé dans Host seulement, `SegmentedControl` bordé dans Host et teinté dans Mail.

## Décision

- **La CSS est livrée brute**, pas compilée : `styles.css` déclare `@theme`, les jetons `:root` / `.dark`, la couche `base` et les `@utility`, et le produit l'importe juste après `@import "tailwindcss"`. Tailwind du produit génère une seule feuille, avec ses propres classes et celles du kit.
- **`@source "./dist"`** dans cette feuille : Tailwind ignore `node_modules`, c'est le kit qui déclare où sont ses classes. Le produit n'a rien à configurer.
- **Un sous-chemin par composant** (`@hgdc/ui/button`, `exports` `"./*"`), sans fichier d'index : pas de barrel, chaque import ne tire que son module.
- **Référence : l'interface de Host**, avec portal-v2 et le site pour la DA. Là où les copies divergeaient, la version de Host l'emporte. L'interface de Mail sera refaite pour s'y aligner (la 0.2.1 retire les reprises de Mail de la 0.2.0).
- **Jetons communs dans le kit, écarts dans le produit** : un produit redéfinit un jeton (`--chart-1`, `--accent-soft`) ou ajoute les siens (teintes des rubriques de Mail) dans son `styles.css`, après l'import. `--ring` et `--accent-soft` dérivent de `--accent`, lui-même lu dans `--brand-accent` quand le produit le pose (couleur d'un client) : changer l'accent suffit.
- **`shadcn` en dépendance** pour `shadcn/tailwind.css` (variantes `data-open`, animations d'entrée), plutôt qu'une copie : Renovate suit sa version.
- **Plages `^`** pour les dépendances du paquet, alignées sur le plus bas commun des produits : une bibliothèque ne doit pas imposer une montée de version. React et Tailwind sont des `peerDependencies`.
- `isolatedDeclarations` (preset `library`) est gardé : les variantes `cva` sont typées par `Variants<…>` (`@hgdc/ui/cn`).

## Conséquences

- Un composant se corrige une fois, et la propagation l'apporte à chaque produit.
- Tout utilitaire Tailwind écrit dans un composant du kit doit exister dans le Tailwind du produit : la version de Tailwind se fixe dans la stack.
- Les tests du kit vérifient la parité des thèmes et que chaque jeton lu par un composant est déclaré (`styles.test.ts`).
- Avant publication, le paquet packé est installé dans Host et Mail, leurs imports basculés sur `@hgdc/ui`, puis `check` et `vite build` lancés.
