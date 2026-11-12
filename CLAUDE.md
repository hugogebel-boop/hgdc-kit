# hgdc-kit

Copie publique du kit `@hgdc/*`, écrite par la CI de `basalte` (`kit-mirror.yml`). Règles du kit : `packages/CLAUDE.md`.

- **Ne rien modifier ici** : la copie suivante l'écraserait, et la règle de `main` refuse tout commit qui ne vient pas d'elle. Le kit se change dans `basalte`, dans la même PR que les modules qui l'utilisent.
- **Dépôt public** : ni secret, ni nom d'hôte interne, ni vision produit.
- Ce dépôt ne fait que publier (`release.yml`, nom déclaré comme trusted publisher sur npm : ne pas le renommer) et propager (`propagate.yml`). Les versions se montent dans `basalte`.
