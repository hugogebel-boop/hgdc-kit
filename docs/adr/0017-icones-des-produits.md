---
owner: Hugo Gebel
last_reviewed: 2026-10-18
status: accepted
---

# 0017. Icônes des produits : une seule tuile, un favicon sans fond

## Contexte

Depuis le 17.10, l'icône d'un produit pose son pictogramme sur un fond blanc, en clair comme en sombre. La forme changeait selon le contexte : squircle dans la barre, le menu du compte, les e-mails et les icônes d'application, rond pour « Propulsé par », carré arrondi pour le favicon. Le pictogramme occupait 64 % de la tuile, centré sur sa viewBox : il paraissait petit, et décalé quand son dessin ne remplit pas sa viewBox (Account, Portal).

## Décision

- **Une seule forme** pour la tuile blanche : carré arrondi, rayon 14/64 (environ 22 %). Barre des produits, menu du compte, « Propulsé par », e-mails, `icon-192` et `icon-512`. `ProductBadge` n'a plus de prop `shape`.
- **Pictogramme à 10 % de marge**, centré sur son encre (boîte englobante du dessin) et non sur sa viewBox. Planche de comparaison à 8, 10 et 12 % : 8 % colle aux bords en 20 px, 12 % revient presque à l'ancien rendu.
- **Favicon sans fond** : le pictogramme seul, marge 4 %. `favicon.svg` passe à la variante sombre (dégradé éclairci) sous `prefers-color-scheme: dark` ; `favicon.ico` (16, 32, 48) garde la variante claire.
- **Icônes d'application** sur fond blanc, un téléphone les pose sur n'importe quel fond d'écran : `apple-touch-icon` en plein cadre (iOS découpe), même marge de 10 % ; `icon-maskable-512` en plein cadre, encre gardée dans la zone sûre (cercle de 80 %), d'où une marge de 18 à 22 % selon le dessin.
- Tout est généré par `scripts/family.ts` depuis `packages/ui/family/`. Les PNG des e-mails sont servis par hgdc.ch (`site/public/email/`) : les recopier après chaque génération.

## Conséquences

- Un produit qui passait `shape="round"` le retire en montant `@hgdc/ui`.
- Chaque produit recopie `family/app/<mot>/` dans son `public/` pour changer favicon et icônes d'application.
- Le H « Double » de la marque n'est pas concerné : sans fond, en deux variantes.
