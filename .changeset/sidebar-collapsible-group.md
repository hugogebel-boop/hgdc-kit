---
"@hgdc/ui": minor
---

`SidebarNavGroup` accepte `collapsible` : le titre devient une entrée à flèche (avec `icon`) qui déroule ses rubriques. Fermé par défaut (`defaultOpen`), ouvert dès qu'une rubrique est la page ouverte (`active`, ou lu dans les liens après l'hydratation), état mémorisé par navigateur (`storageKey`, par défaut le titre). Bouton natif avec `aria-expanded` et `aria-controls`, animation coupée sous `prefers-reduced-motion`, rubriques toujours visibles en rail.
