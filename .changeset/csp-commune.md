---
"@hgdc/ui": minor
---

`@hgdc/ui/csp` : politique de sécurité du contenu commune aux consoles (`documentPolicy`, `newNonce`, `connectSources`, `BASE_POLICY`, `FAMILY_CONNECT_SOURCES`, `KIT_INLINE_SCRIPT_HASHES`). Les modules partagent une origine : la même politique à nonce s'applique à tous, et les empreintes des scripts du paquet sont tenues ici, vérifiées par un test.
