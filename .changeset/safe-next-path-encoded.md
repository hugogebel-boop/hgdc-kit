---
"@hgdc/auth": patch
---

`safeNextPath` refuse aussi un chemin qui ne devient `//hôte` qu'une fois normalisé (`/.//evil.ch`, `/a/..//evil.ch`), les caractères refusés une fois décodés (`/%2F%2Fevil.ch`, `/%5Cevil.ch`, `/%09`), un encodage invalide et les blancs non encodés.
