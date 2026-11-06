---
"@hgdc/ui": minor
---

Une seule barre latérale dans `AppShell` : elle remplace la barre des produits.

- En haut : l'organisation, le bouton Réduire et le lien Manager. Dessous, les onglets du module ouvert, avec « Retour aux modules ».
- Le retour affiche la liste des modules, sans recharger la page. « Personnaliser la barre » permet de les ranger, masquer et ajouter ; le choix est gardé dans `localStorage` (`hgdc-shell:modules`).
- Réglages reste au-dessus du compte. Documentation, État du service et l'autre vue passent dans `AccountMenu`, qui ne liste plus les produits.
- Sans barre (`productRail={false}` ou vue seule) : la marque du produit, les trois accès au-dessus du compte et « Produits » dans son menu.
- Le catalogue affiche les noms des modules : Déploiements, E-mails, Surveillance, Statistiques, Documentation, Assistant IA et Connexion. Les mots et les adresses ne changent pas. Les e-mails reprennent ces noms en tête.

Changements cassants :

- `ProductRail` et le module `product-rail` sont supprimés.
- `productRailEntries` devient `shellProductEntries`, et `ProductRailEntry` devient `ShellProductEntry`.
- `data-product-rail` devient `data-module-bar`.
- `markProductSwitch`, `takeProductSwitch` et les constantes `SHELL_SWITCH_*` sont supprimés.
- `data-rail-peek`, `--hgdc-rail-w`, la variante `folded` et le nom de transition `hgdc-product-rail` sont supprimés.
