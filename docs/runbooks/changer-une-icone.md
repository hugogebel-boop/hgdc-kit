---
owner: Hugo Gebel
last_reviewed: 2026-10-18
---

# Changer une icône de produit

Favicon, icônes d'application, tuile de l'interface et icônes des e-mails viennent tous de `@hgdc/ui` (ADR 0017). Aucun produit ni le site ne garde de copie : changer ici, publier, tout suit.

## Changer une variable (marge, forme, taille)

1. Modifier la constante dans `scripts/family.ts` (`MARGIN`, `FAVICON_MARGIN`, `SHAPES`, tailles des PNG).
2. `bun scripts/family.ts && bun run format`, puis vérifier les images dans `packages/ui/family/app/` et `packages/ui/email-icons/`.
3. `bun changeset` (`@hgdc/ui`, `minor`), PR, fusion. Fusionner ensuite la PR « chore: release ».

## Changer le dessin

1. Dans le dépôt du site (`hgdc`), modifier `scripts/brand/collection-icons.mjs` et lancer `npm run assets` : `public/family/<mot>.svg` et `<mot>-dark.svg` changent.
2. Recopier ces deux fichiers (et `hcollection-icon*.svg` pour le H) dans `packages/ui/family/` du kit.
3. Suivre les étapes 2 et 3 ci-dessus.

## Ce qui se passe ensuite, sans rien faire

- `release.yml` publie `@hgdc/ui` puis `propagate.yml` ouvre une PR dans chaque produit et dans le site (`HGDC_UI_REPOS`), fusionnée quand sa CI passe.
- Au build, `hgdc-brand sync <mot>` pose les six icônes dans le `public/` du produit, `hgdc-brand emails public/email` les icônes d'e-mail dans le site.
- Les e-mails envoyés ensuite pointent vers `https://hgdc.ch/email/<mot>.png?v=<nouvelle empreinte>` : Gmail et les autres clients rechargent l'image.

## Vérifier

```sh
curl -sI https://<mot>.hgdc.ch/favicon.svg | grep -i etag
curl -s https://<mot>.hgdc.ch/icon-192.png | sha256sum   # même empreinte que packages/ui/family/app/<mot>/icon-192.png
curl -s https://hgdc.ch/email/<mot>.png | sha256sum | cut -c1-8   # égal à EMAIL_ICON_VERSION.<mot>
```

Une PR de propagation restée ouverte : voir « Incidents » de `publier.md`.
