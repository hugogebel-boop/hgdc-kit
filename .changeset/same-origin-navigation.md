---
"@hgdc/ui": minor
"@hgdc/auth": patch
---

Passage d'un produit à l'autre sous `app.hgdc.ch/<produit>` comme dans une seule app (ADR 0020).

- `@hgdc/ui/styles.css` : transitions de vue entre documents (`@view-transition`, même origine). La barre des produits, la barre latérale et la barre du haut restent en place, le contenu passe en fondu de 150 ms. Mouvement réduit : aucune transition.
- Barre des produits : un produit servi sous la même origine que la page reçoit un lien relatif marqué `data-hgdc-prerender`, prérendu au survol (`PRODUCT_SPECULATION_RULES`, `eagerness: "moderate"`). Les produits encore sur leur sous-domaine restent préchargés comme avant. Le produit courant pointe vers sa base (`/mail/`), plus vers `/`.
- Une page prérendue attend d'être affichée pour relire les organisations. Le cookie de relecture porte la base du produit et le cadre s'ouvre sous elle (`takeOrgSync`).
- Le H du départ vers un autre produit apparaît après 100 ms (`PRODUCT_LEAVE_DELAY_MS`) : une page prérendue s'affiche avant, sans H. Au clic, la barre des produits se replie : la page d'arrivée la montre repliée.
- Groupes repliables de la barre latérale : clé propre au produit (`sidebar-group:<produit>:<titre>`), le thème et la barre réduite restent communs à la famille.
- `@hgdc/auth` : sous `appBasePath`, le cookie `hgdc-org-sync` est limité à ce chemin et porte ce chemin ; un autre produit de la même origine ne le voit plus.
