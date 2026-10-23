---
"@hgdc/auth": minor
---

`createHgdcEntry` : option `appOrigin` (origine publique, `https://app.hgdc.ch`), envoyée comme `Origin` des appels internes à better-auth. Derrière un relais, l'entrée refusait la connexion dès qu'un cookie périmé était présent.
