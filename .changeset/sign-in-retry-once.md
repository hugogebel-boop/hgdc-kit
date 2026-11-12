---
"@hgdc/auth": patch
---

`startHgdcSignIn` et `HgdcSignInButton` réessaient une fois, après 600 à 900 ms, quand le début de la connexion échoue par une erreur serveur passagère (5xx) ou un échec réseau. Jamais sur un 4xx (un 429 reste respecté). Le bouton reste en attente pendant ce second essai ; s'il échoue aussi, `onError` est appelé comme avant.
