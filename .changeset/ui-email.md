---
"@hgdc/ui": minor
---

Modèle commun des e-mails transactionnels : `@hgdc/ui/email`. `EmailLayout` (icône et nom du produit en tête, accent tiré du catalogue, pied « Propulsé par HGDC Mail » et mentions légales) et les blocs `EmailHeading`, `EmailText`, `EmailLink`, `EmailButton` (lien direct, jamais réécrit), `EmailCode`, `EmailCallout`, `EmailDivider`, `EmailDetails`. `renderEmail(element)` rend `{ html, text }` : tableaux et styles en ligne, 600 px, mode sombre (`color-scheme`, Apple Mail, Outlook), version texte tirée du même rendu. Rendu par React Email : `react-email` 6.11 devient une `peerDependency` facultative, à installer par le produit qui envoie. Icônes PNG des produits dans `@hgdc/ui/email-icons/*`, servies par `https://hgdc.ch/email/<mot>.png`. Le catalogue gagne un champ facultatif `accent` (hex clair et sombre). Aucune API existante ne change.
