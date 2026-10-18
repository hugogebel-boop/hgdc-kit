---
"@hgdc/ui": minor
---

`hgdc-brand`, bin qui pose les icônes du kit au build : `hgdc-brand sync <mot>` (favicon et icônes d'application dans `public/`, `--email-as` pour une ancienne adresse d'icône d'e-mail) et `hgdc-brand emails <dossier>` (icônes d'e-mail du site). `@hgdc/ui/email-icon` (`EMAIL_ICON_BASE`, `emailIconUrl`, sans React Email, aussi réexportés par `@hgdc/ui/email`) : `emailIconUrl` ajoute l'empreinte de l'image (`?v=`, `EMAIL_ICON_VERSION`) : les clients mail rechargent une icône qui a changé.
