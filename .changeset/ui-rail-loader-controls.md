---
"@hgdc/ui": minor
---

- Barre des produits : au survol, elle ne recouvre plus la page. La barre latérale se plie le temps du survol et la barre prend sa place (248 px) ; déjà pliée, la barre pousse la page (220 px). Account passe en tête, sous l'organisation. Nouvelle variante CSS `folded:` (pliée par la personne) ; `rail:` vaut aussi pendant le survol. Le pliage de la barre latérale dure 200 ms.
- Liens vers les produits (`entryHref`, barre et menu) : `/auth/hgdc?refresh=1&next=/`, qui relit les organisations au passage (`PRODUCT_ENTRY_REFRESH_QUERY`). Avant `@hgdc/auth` 0.7, l'entrée ignore `refresh`.
- `FamilyLoader` (`@hgdc/ui/family-loader`) : chargement de page, le H tricolore qui se construit en boucle, visible après 200 ms.
- Interrupteur, case à cocher, bouton radio éteints : piste et bords `--control-off`, à 3:1 au moins du fond, d'une carte et de `--muted`, en clair et en sombre. Désactivé : tout l'interrupteur s'estompe.
