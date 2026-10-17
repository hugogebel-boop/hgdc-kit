---
owner: Hugo Gebel
last_reviewed: 2026-10-15
status: accepted
---

# 0007. `@hgdc/ui/email` : un modèle d'e-mail commun, rendu par React Email

## Contexte

Chaque produit écrivait ses e-mails transactionnels à sa façon : Mail avec React Email et sa propre mise en page, Account en HTML concaténé, Status en texte seul, Portal avec un troisième gabarit. Couleurs, largeurs, pieds et ton différaient d'un produit à l'autre, sans mode sombre ni version texte soignée.

## Décision

- **Un sous-chemin de `@hgdc/ui`**, `@hgdc/ui/email`, plutôt qu'un paquet : il partage le catalogue des produits (nom, icône, accent) et la DA.
- **React Email** (`react-email` 6.11), déjà employé par Mail, pour ses composants éprouvés (tableaux, bouton compatible Outlook, aperçu caché) et `render`/`toPlainText`. En `peerDependency` facultative : le paquet tire le CLI de React Email, qu'un produit qui n'envoie rien ne doit pas installer. Sa version entre dans la stack.
- **Une mise en page, des blocs** : `EmailLayout` (en-tête produit, carte, pied « Propulsé par HGDC Mail » et mentions légales) et huit blocs. Pas d'option de mise en page : un écart se discute ici.
- **Couleurs en hex**, traduites des jetons OKLCH de `styles.css` (`email-palette.ts`) : les clients mail ne lisent ni oklch ni les variables. Contraste de 4,5:1 vérifié par les tests dans les deux thèmes. Le catalogue porte l'accent de chaque produit (`accent`, violet de la DA pour tous aujourd'hui) ; `accent` sur `EmailLayout` pose la couleur d'un client.
- **Mode sombre** par `color-scheme`, `@media (prefers-color-scheme: dark)` et les sélecteurs `[data-ogsc]`/`[data-ogsb]` d'Outlook.com ; ailleurs les couleurs en ligne restent claires, quasi blanc et quasi noir pour mieux supporter l'inversion forcée de Gmail.
- **Icônes en PNG hébergées**, la pastille H Collection de chaque produit (`packages/ui/family/`, PNG par `scripts/family.ts` ; à l'origine une bulle générée depuis l'icône du catalogue) : Gmail et Outlook n'affichent ni SVG ni `data:`. Servies par `https://hgdc.ch/email/<mot>.png`, un seul hôte pour toute la famille.
- **Liens jamais réécrits** : `EmailButton` et `EmailLink` posent l'URL telle quelle et refusent tout lien qui n'est pas absolu (`https:`, `http:`, `mailto:`). Le suivi des clics, s'il existe, reste à HGDC Mail.
- **Texte tiré du HTML** (`toPlainText`) avec deux réglages : titres en casse normale, détails sur une ligne.

## Conséquences

- Un produit qui adopte le modèle installe `react-email` à la version de la stack et rend dans une action `"use node"`, comme Mail.
- Les icônes ne s'affichent qu'une fois copiées dans `site/public/email/` du site hgdc.ch ; d'ici là, le texte « HGDC <mot> » porte l'en-tête. Toute nouvelle icône du catalogue se régénère et se recopie.
- Le pied est imposé : « Propulsé par HGDC Mail » et « Hugo Gebel Développement Conseil, Lausanne ». La raison de l'envoi et le désabonnement passent par `footer`.
- `scripts/email-showcase.tsx` sert de vitrine et de modèle à copier ; ses tests refusent le grand tiret et un HTML proche de la coupure de Gmail (102 ko).
