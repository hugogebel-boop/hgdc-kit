---
"@hgdc/ui": minor
---

Chargement des pages refait (retour de Hugo) : `FamilyLoader` montre la silhouette grise du H dont les pièces se remplissent de leurs dégradés (`transform` seul, 1,6 s, phase commune à tous les H ; la prop `delay` disparaît). `AppShell navigating` couvre la zone de contenu du H après 50 ms dès qu'une navigation attend, la coque restant en place ; `PagePending` partage la même place (aucun saut) ; un clic vers un autre produit (barre, menu du compte) couvre aussitôt la zone de contenu. `routerPendingDefaults` ajoute le préchargement au survol (`defaultPreload: "intent"`, `defaultPreloadStaleTime: 0`) et passe à 50 ms / 300 ms.
