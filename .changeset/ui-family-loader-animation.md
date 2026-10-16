---
"@hgdc/ui": patch
---

`FamilyLoader` s'anime de nouveau en production : la minification de Vite (lightningcss) réduisait le raccourci sans nom `animation: 1.8s infinite both` des pièces à `animation: none`. Chaque pièce porte désormais son animation complète ; un test minifie `styles.css` avec lightningcss et le vérifie. Mouvement réduit inchangé (le H respire).
