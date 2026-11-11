---
"@hgdc/ui": minor
---

Chargement des pages (ADR 0025) : une navigation dans le module garde l'ancienne page et montre une barre de progression sous la barre du haut ; une page qui attend dans la coque montre son squelette (`PageSkeleton`, `PagePending variant`), plus le H ; `routerPendingDefaults` passe à 1000 ms et 500 ms (défauts de TanStack Router). Le H reste pour le document sans coque et le départ vers un autre module. Retirés, sans utilisateur : `ContentLoadingContext` (→ `ShellContentContext`), `useContentLoading` (→ `useShellCover`), `ContentLoadingStage`.
