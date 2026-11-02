---
"@hgdc/assistant": minor
---

`@hgdc/assistant/secret` exporte `sealWithKey` et `openWithKey` : même format `v1.<iv>.<chiffré>` avec une clé AES-GCM importée par l'appelant, pour un produit qui garde sa propre clé maître. `sealSecret` et `openSecret` passent par elles, sans changement de format.
