---
"@hgdc/ui": minor
---

Icônes des produits : une seule tuile, carré blanc arrondi (rayon 14/64) partout, barre, menu du compte, « Propulsé par », e-mails et icônes d'application. Le pictogramme passe à 10 % de marge, centré sur son dessin. `ProductBadge` perd la prop `shape` (à retirer là où `shape="round"` était passé) et `BadgeShape` disparaît. `family/app/<mot>/favicon.svg` est désormais sans fond et passe à la variante sombre sous `prefers-color-scheme: dark` ; la maskable garde le dessin dans la zone sûre. `family/tile/<mot>-round.svg` et `-favicon.svg` sont retirés.
