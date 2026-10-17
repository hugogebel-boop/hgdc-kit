---
"@hgdc/ui": minor
---

Chargeur H refait (ADR 0015) : un seul H par document (`FamilyLoaderRoot`, à poser dans le `body` de la route racine), fixe sur la zone de contenu de la coque, au même pixel dans tous les états (navigation, `PagePending`, `Suspense`, rendu serveur, page d'entrée, autre produit) ; une seule boucle de 2 s pour tout le H (gauche, barre, droite, H complet, fondu), calée sur l'horloge pour que deux pages et deux produits soient en phase ; hors de la coque, le cadre de la coque est dessiné. La zone de contenu réserve sa barre de défilement et la barre latérale se plie dans la même image que la barre des produits s'élargit.
