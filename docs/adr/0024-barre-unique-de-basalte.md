---
owner: Hugo Gebel
last_reviewed: 2026-11-06
status: accepted
---

# 0024. Une seule barre latérale dans `AppShell`

Remplace l'ADR 0011. Complète l'ADR 0020 : la transition de vue et le prérendu restent, sans la barre des produits.

## Contexte

La coque montrait deux colonnes à gauche : la barre des produits (ADR 0011), puis la barre latérale du produit ouvert. La première s'élargissait au survol et pliait la seconde le temps du survol. Il fallait donc un délai d'intention, une note de passage d'une page à l'autre (`markProductSwitch`) et un état de pliage temporaire (`data-rail-peek`), seulement pour éviter qu'elle s'ouvre sous une souris restée immobile.

Basalte devient un seul produit, dont les anciens produits sont des modules. Une barre qui liste des produits, chacun avec sa marque, ne correspond plus à ce qu'on montre.

## Décision

- **Une seule barre.** De haut en bas : l'organisation et le bouton Réduire, le lien Manager, un trait, puis le niveau affiché, et enfin Réglages et le compte. `ProductRail` est supprimé.
- **Trois niveaux, en état local de la coque, sans changement d'adresse.**
  - `tabs` : « Retour aux modules », le nom du module, la navigation du produit (`nav`).
  - `modules` : la liste des modules (des liens, le courant en `aria-current`) et « Personnaliser la barre ».
  - `edit` : un brouillon, avec monter, descendre, masquer et ajouter. Glisser à la souris ; les flèches servent au clavier et au doigt. « Valider » enregistre, « Annuler » oublie.
- **Choix de la personne dans le navigateur** : `localStorage`, clé `hgdc-shell:modules`, commune aux consoles servies sous la même origine. Pas de synchronisation entre appareils pour l'instant : un réglage de confort ne justifie pas un appel réseau à chaque page.
- **Le module ouvert reste visible** : s'il est masqué, la liste l'ajoute à la fin sans modifier le réglage.
- **Noms** : le catalogue (`products.ts`) affiche le nom de fonction (Déploiements, E-mails, Surveillance, Statistiques, Documentation, Assistant IA, Connexion). Le mot reste dans les adresses, les clés et le code.
- **Menu du compte** : dans la barre, il porte Documentation, État du service et l'autre vue (`ShellMenuLinksContext`), et ne liste plus les produits.
- **Sans barre** (`productRail={false}`, vue seule de l'ADR 0014) : la marque du produit (`SidebarHead`), l'organisation dessous, les trois accès au-dessus du compte, « Produits » dans son menu.
- **Téléphone** : le tiroir porte les mêmes niveaux. Le retour et la personnalisation le laissent ouvert (`keepMenuOpen`) ; choisir une page le referme.
- **Cadre du chargeur** (`ShellFrame`, ADR 0020) : `OrgPlaceholder`, Manager, retour aux modules, nom du module, navigation en squelette, aux mêmes boîtes que la coque.

## Conséquences

- Changements cassants pour les produits, à la montée de `@hgdc/ui` : `productRailEntries` devient `shellProductEntries`, `ProductRailEntry` devient `ShellProductEntry`, `data-product-rail` devient `data-module-bar`. `markProductSwitch`, `takeProductSwitch`, `SHELL_SWITCH_*`, `data-rail-peek`, `--hgdc-rail-w`, la variante `folded` et le nom de transition `hgdc-product-rail` disparaissent.
- La prop `productRail` garde son nom pour ne pas casser les produits, même si elle commande désormais la barre des modules.
- Passer d'un module à un autre demande deux clics (retour, puis module) au lieu d'un clic après un survol. En échange, plus de minuterie ni d'état partagé entre deux documents.
- La liste des modules est écrite deux fois : `modules.ts` (ordre, utilité) et `products.ts` (adresses, noms). Un test vérifie que les noms concordent.
- Le niveau affiché n'est pas retenu : une nouvelle page rouvre sur les onglets.
- L'ADR 0020 décrit encore la barre immobile entre deux documents : ce passage vaut pour l'historique, seuls la barre latérale, la barre du haut et le H portent désormais un nom de transition.
