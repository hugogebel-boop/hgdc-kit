---
"@hgdc/auth": minor
---

`HgdcSignInButton` demande à ID le choix du compte (`prompt=select_account`) : après une déconnexion, la personne voit ses comptes au lieu de revenir connectée d'office. `startHgdcSignIn` reçoit l'option `chooseAccount` ; sans elle, l'appel ne change pas.
