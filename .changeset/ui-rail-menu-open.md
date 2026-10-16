---
"@hgdc/ui": patch
---

Barre des produits (`ProductRail`, ADR 0011) : elle reste élargie tant qu'un menu ouvert depuis elle est ouvert (sélecteur d'organisation ou tout autre menu, suivi par `aria-expanded` du déclencheur), même quand la souris la quitte pour aller dans le menu ; elle se replie à la fermeture si la souris n'est plus dessus. Le focus rendu au déclencheur après un menu ouvert à la souris ne la garde plus ouverte (seul le clavier compte).
