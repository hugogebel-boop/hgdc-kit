---
"@hgdc/ui": minor
---

Coque, assistant, menu du compte, avatars et chargeur H, communs à tous les produits.

- `AppShell` : nouvelles props `links` (Documentation, Réglages, État du service, dans cet ordre, juste au-dessus du compte ; chaque accès est une adresse ou `{ render: <Link to="…" /> }`, État du service suit `statusPage` par défaut, `status: false` le retire) et `account` (`AccountMenu`, tout en bas).
- `AppShell` : nouvelle prop `assistant={{ open, onOpenChange, panel, label?, shortcut? }}`. Bouton Assistant juste à côté de la recherche ; ouvert, une colonne à droite sur le fond de l'application, la page se rétrécit et se réorganise ; sous 1280 px, vue dédiée plein écran avec « Retour à la page ». Échap ferme, le focus est géré, mouvement réduit respecté, le panneau reste monté après fermeture. Le produit passe seulement le corps (conversation et saisie).
- Migration : `sidebarFooter` est déprécié. Passer `AccountMenu` dans `account`, les liens Docs et Réglages dans `links`, et retirer l'ancien lien vers l'assistant du bas de la barre. Sans `account`, `sidebarFooter` reste rendu tel quel, sous l'accès État du service.
- `AccountMenu` : identité (avec l'avatar) en tête, puis Profil, Sécurité, Thème (Système, Clair, Sombre, choix actif en encre pleine), entrées du produit, Se déconnecter à part. Plus d'entrée « État du service » (dans la barre) ni « Raccourcis clavier » (la touche `?` reste au produit) : `statusPage` et `onShortcuts` sont dépréciés et ignorés.
- Avatars : `AvatarFallback` colore les initiales d'une des sept teintes des icônes des produits, stable par `colorKey` (identifiant ou adresse e-mail, sinon le texte), contraste de 4,5:1 au moins en clair et en sombre ; `colorKey={null}` garde le gris. Nouveau `avatarTone(key)` dans `@hgdc/ui/initials`. `AccountMenu` et `MemberItem` s'en servent.
- `FamilyLoader` : un seul H, sans reflet ni ombre, recentré ; en mouvement réduit, le H plein immobile.
