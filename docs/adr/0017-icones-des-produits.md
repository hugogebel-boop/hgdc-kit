---
owner: Hugo Gebel
last_reviewed: 2026-10-18
status: accepted
---

# 0017. Icônes des produits : une seule tuile, un favicon sans fond, une seule source

## Contexte

Depuis le 17.10, l'icône d'un produit pose son pictogramme sur un fond blanc, en clair comme en sombre. La forme changeait selon le contexte : squircle dans la barre, le menu du compte, les e-mails et les icônes d'application, rond pour « Propulsé par », carré arrondi pour le favicon. Le pictogramme occupait 64 % de la tuile, centré sur sa viewBox : il paraissait petit, et décalé quand son dessin ne remplit pas sa viewBox (Account, Portal).

## Décision

- **Une seule forme** pour la tuile blanche : carré arrondi, rayon 14/64 (environ 22 %). Barre des produits, menu du compte, « Propulsé par », e-mails, `icon-192` et `icon-512`. `ProductBadge` n'a plus de prop `shape`.
- **Pictogramme à 12 % de marge**, centré sur son encre (boîte englobante du dessin) et non sur sa viewBox. Choisi par Hugo sur une planche à 8, 10 et 12 % (barre 40 px, menu 20 px, e-mail 48 px, app 192 px, clair et sombre) : 8 % colle aux bords en 20 px, 12 % laisse respirer le dessin dans la tuile.
- **Favicon sans fond** : le pictogramme seul, marge 4 %. `favicon.svg` passe à la variante sombre (dégradé éclairci) sous `prefers-color-scheme: dark` ; `favicon.ico` (16, 32, 48) garde la variante claire.
- **Icônes d'application** sur fond blanc, un téléphone les pose sur n'importe quel fond d'écran : `apple-touch-icon` en plein cadre (iOS découpe), même marge de 12 % ; `icon-maskable-512` en plein cadre, encre gardée dans la zone sûre (cercle de 80 %), d'où une marge de 18 à 22 % selon le dessin.
- Tout est généré par `scripts/family.ts` depuis `packages/ui/family/`.
- **Une seule source, aucune copie versionnée** (révision du 2026-10-18) : les produits et le site ne gardent plus de copie des icônes. `hgdc-brand` (bin de `@hgdc/ui`) les pose à chaque build et au démarrage du dev : `hgdc-brand sync <mot>` dans le `public/` du produit, `hgdc-brand emails public/email` dans le site hgdc.ch, qui reste la seule adresse des icônes d'e-mail (`EMAIL_ICON_BASE`). Les fichiers posés sont dans le `.gitignore` de chaque dépôt.
- **Adresse des icônes d'e-mail** : `emailIconUrl(mot)` ajoute `?v=<empreinte>` (8 caractères du SHA-256 du PNG, `EMAIL_ICON_VERSION`, écrit par `scripts/family.ts`). Le proxy d'images de Gmail met une image en cache par adresse : une nouvelle empreinte la fait recharger, une image inchangée garde la sienne. Les e-mails déjà envoyés gardent leur adresse, qui sert toujours l'image du moment.
- **Propagation** : chaque release de `@hgdc/ui` ouvre une PR dans les produits et le site (`propagate.yml`, variable `HGDC_UI_REPOS`), fusionnée quand la CI passe. Le geste « changer une icône » s'arrête donc à la release du kit (`docs/runbooks/changer-une-icone.md`).

## Conséquences

- Un produit qui passait `shape="round"` le retire en montant `@hgdc/ui`.
- Un produit déclare `hgdc-brand sync <mot>` en tête de `build` et de `dev`, et ignore les six fichiers dans git. Mail ajoute `--email-as hgdc-mail-icon.png --email-as hgdc-mark.png` : ces deux adresses figurent dans des e-mails déjà envoyés, elles servent désormais l'icône d'e-mail du kit.
- Le site hgdc.ch installe `@hgdc/ui` en dépendance de développement, pour son build seulement.
- Ordre de mise en ligne : le site fusionne dès son check vert, les produits après leur CI ; pendant ces quelques minutes, un e-mail peut pointer vers une empreinte que hgdc.ch ne sert pas encore (ancienne image sous la nouvelle adresse). Risque accepté.
- Le dessin lui-même vit encore dans le site (`scripts/brand/collection-icons.mjs`) et se recopie dans `packages/ui/family/` : seule copie qui reste, à la main.
- Le H « Double » de la marque n'est pas concerné : sans fond, en deux variantes.
