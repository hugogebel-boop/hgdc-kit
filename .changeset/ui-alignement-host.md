---
"@hgdc/ui": patch
---

Le kit suit l'interface de Host : `SegmentedControl` retrouve son contour, `surface` et `surface-link` reprennent la version de Host, et `--brand-accent` permet de nouveau de poser la couleur d'un client. Un bouton ne grossit plus au survol et sa couleur ne suit plus la courbe à rebond : le libellé ne clignote plus. `Spinner` devient l'anneau de la DA (arc sur une piste, `tone="accent"` seul sur une page, annoncé « Chargement » aux lecteurs d'écran), aussi dans les toasts. Nouveaux jetons `--info` (bleu, le violet reste l'accent) et encres `--status-active-ink`, `--status-paused-ink`, `--info-ink` : les badges atteignent 4,5:1. `--secondary` et `--popover` deviennent des synonymes de `--muted` et `--card`.
