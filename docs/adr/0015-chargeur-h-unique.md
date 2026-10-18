---
owner: Hugo Gebel
last_reviewed: 2026-10-17
status: accepted
---

# 0015. Un seul chargeur H, au même pixel d'une page et d'un produit à l'autre

## Contexte

Retours de Hugo en production, le 17.10 :

1. « À la moitié du chargement, le H qui charge se décale vers le haut. »
2. « On dirait que chaque élément charge séparément et a sa propre boucle. »
3. D'un produit à l'autre (`host.hgdc.ch` vers `mail.hgdc.ch`), la page entière se recharge et le chargeur ne reste pas en continu.

Mesures (`@hgdc/ui` 0.14.2, Chrome, 1440 × 900, latence ajoutée de 400 ms, position du centre du H relevée à chaque image par `requestAnimationFrame` et `getBoundingClientRect`) :

| État                                                                                                | Centre du H                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Calque de navigation de la coque (`app-shell-loading`), sans barre de défilement                    | 872, 478                             |
| `PagePending` dans la coque (la page attendue fait apparaître la barre de défilement de 6 px)       | 869, 478                             |
| Clic dans la barre des produits : la barre s'élargit, la barre latérale se plie une image plus tard | 872 → 901 → 872, 478                 |
| `PagePending` ou `FamilyLoader page` hors de la coque (page d'entrée `/o`, rendu serveur)           | 720, 450                             |
| Mail `/o` puis `/o/<org>` : deux `PagePending` successifs                                           | H démonté, une image vide, H remonté |

Causes :

- **Le saut vers le haut** : le chargement passe d'un H centré dans la zone de contenu (478) à un H centré dans l'écran (450), 28 px plus haut et 152 px plus à gauche. Cela arrive à chaque passage d'un produit à l'autre et à chaque chargement servi hors de la coque. S'y ajoute un effet d'optique : l'ancien remplissage continuait de monter et sortait par le haut, ce qui donnait l'impression que le H lui-même montait.
- **Plusieurs boucles** : chaque pièce avait sa propre animation de 1,6 s, avec ses délais (0, 0,2 s, 0,4 s). Les pièces se vidaient chacune à son tour, et le H complet n'était jamais visible.
- **Plusieurs éléments** : calque de la coque, `PagePending`, repli `Suspense` et chargeur de page dessinaient chacun leur H. On passait de l'un à l'autre en démontant et en remontant, avec des positions calculées différemment (zone de contenu, `sticky`, `min-height`, écran).
- **Barre de défilement** : la zone de contenu défile seule sur ordinateur ; sa barre apparaît ou disparaît avec le calque et l'en-tête bouge de 6 px.

## Décision

**Un seul H par document.** `FamilyLoaderRoot`, posé une fois dans le `body` de la route racine, rend un élément toujours monté (`data-slot="family-loader-root"`), en position fixe. Le CSS le montre, sans JavaScript, quand une page attend hors de la coque (`:has([data-slot=page-pending])`), quand la coque charge (`data-loading`), ou dès le HTML du serveur quand une page attend dans une coque pas encore hydratée. `PagePending`, `FamilyLoader page`, le repli `Suspense` et la coque ne dessinent plus de H : ils marquent la place de la page ou posent `data-loading`. Le H n'est jamais démonté entre deux états ; son masquage attend 80 ms, ce qui absorbe le remplacement d'un `PagePending` par un autre.

**Une seule scène.** Le H est centré sur la zone de contenu de la coque, calculée depuis l'écran : téléphone, sous l'en-tête de 56 px (et la zone sûre) ; ordinateur, après la barre des produits (56 px) et la barre latérale (256 px, 64 en rail, lue sur `<html data-sidebar>` avant la première peinture), sous la marge de 8 px et l'en-tête de 56 px. Comme il est fixe, ni le défilement, ni la barre de défilement, ni le pliage de la barre latérale au survol de la barre des produits ne le déplacent. Hors de la coque, le chargeur dessine le cadre de la coque (barre des produits, barre latérale, zone de contenu arrondie) : la page qui arrive a déjà sa forme. La zone de contenu réserve sa barre de défilement (`scrollbar-gutter: stable`) ; la barre latérale se plie dans la même image que la barre des produits s'élargit.

**Une seule boucle.** 2 s pour tout le H, une durée et aucun délai pour les trois pièces :

| Temps        | Geste                                                                 |
| ------------ | --------------------------------------------------------------------- |
| 0-500 ms     | le jambage gauche se remplit de bas en haut                           |
| 300-800 ms   | la barre le prolonge vers la droite                                   |
| 600-1100 ms  | le jambage droit s'ouvre depuis la barre, vers le haut et vers le bas |
| 1100-1500 ms | le H complet tient                                                    |
| 1500-1750 ms | tout le H se vide d'un fondu, ensemble                                |
| 1750-2000 ms | la silhouette grise seule, puis ça recommence                         |

Remplissages en `--ease-in-out`, fondu en `--ease-out`. Seuls `transform` et `opacity` s'animent, sur les couches internes : l'animation tourne sur le compositeur pendant que la page charge. Mouvement réduit : le H plein, immobile (0.29 ; il respirait avant). La silhouette prend plus de lumière en sombre. Depuis 0.29, un seul H : le reflet décalé du H « Double » est retiré du chargeur (ni ombre ni double à aucune image de la boucle, demande du 2026-10-18), le H recentré dans son cadre de 46 unités. La marque elle-même (`FamilyMark`, `hcollection-icon.svg`) ne change pas.

**Une seule horloge.** Chaque H cale ses animations sur `(performance.timeOrigin + performance.now()) % 2000` : `startTime = -(timeOrigin % 2000)`. Deux documents, deux produits, le rendu serveur et l'hydratation tombent à la même phase sans se parler. Le calage est fait par un script en ligne juste après l'élément, dans le HTML du serveur : il s'exécute avant l'hydratation, une fois la feuille de style chargée (un script attend les feuilles qui le précèdent). Une animation recréée (`animationstart`, mouvement réduit basculé) se recale.

**Rythme.** Une navigation dans le produit couvre la zone de contenu après 50 ms, une page qui attend aussitôt (le routeur a déjà attendu 50 ms), un clic vers un autre produit aussitôt. Une fois montré, le chargement reste au moins 300 ms. Le calque et le H apparaissent en 150 ms et s'effacent ensemble en 120 ms après 80 ms de retenue.

### D'un produit à l'autre, sans changer de domaine

La règle de la famille reste « un produit = `<mot>.hgdc.ch` ». La continuité se fait ainsi :

1. Au clic dans la barre des produits, la coque se couvre aussitôt du H.
2. La page d'arrivée montre le même H, au même pixel et à la même phase, dès le premier rendu de son HTML.
3. Le temps entre les deux est celui des redirections d'authentification (mesuré le 17.10, réseau normal, depuis Host) :

| Saut                                                                                           | Durée           |
| ---------------------------------------------------------------------------------------------- | --------------- |
| `mail/auth/hgdc?refresh=1&next=/` (connexion OAuth préparée par le serveur)                    | 0,5 à 1,0 s     |
| `account/api/auth/oauth2/authorize`                                                            | 0,4 à 0,7 s     |
| `mail/api/auth/oauth2/callback/hgdc` (échange du code, nouvelle session, organisations relues) | 1,1 à 1,4 s     |
| `mail/?synced=1` puis `mail/o`                                                                 | 0,3 s           |
| **Total, clic → HTML de Mail**                                                                 | **2,4 à 3,5 s** |
| Sans `refresh=1`, session de Mail ouverte (`/auth/hgdc` → `/` → `/o`)                          | 0,45 s          |

Pendant ces 2 à 3 s, le navigateur garde la page de Host et son H à l'écran (les redirections ne peignent rien), puis peint le H de Mail au même endroit et à la même phase.

### Préchargement : écarté tant que l'entrée relit les organisations

Speculation Rules (`prefetch` au survol, `eagerness: "moderate"`, 200 ms de survol) :

- Chrome seulement. Safari derrière un drapeau, Firefox non (Chrome for Developers, « Prerender pages », 2026). Entre sous-domaines de `hgdc.ch`, le préchargement est « same-site » et garde les cookies ; le prérendu entre origines différentes du même site exige que la page cible réponde `Supports-Loading-Mode: credentialed-prerender` (MDN, « Speculation Rules API »).
- Un préchargement suit les redirections et n'est gardé que si la réponse finale est 2xx (MDN). Mais l'entrée `refresh=1` a des effets de bord sur un `GET` : état OAuth et PKCE posés en cookie, code d'autorisation émis par Account, nouvelle session créée au retour. Un survol sans clic ouvrirait une session pour rien, et un code ne sert qu'une fois. MDN met en garde contre exactement ce cas.

Donc pas de préchargement de l'entrée actuelle. Il redevient possible, et sûr, si l'entrée depuis la barre des produits ne fait plus que lire la session (voir ci-dessous) : `/auth/hgdc?next=/` ne fait que `get-session` et deux redirections.

### Raccourcir la chaîne (proposition, hors de cette décision)

`refresh=1` coûte environ 2 s à chaque changement de produit pour un seul cas : une organisation rejointe dans Account depuis la dernière connexion au produit (ADR 0013 ; les retraits arrivent déjà par les événements de l'ADR 0014). Pistes, à trancher avec `@hgdc/auth` :

1. Ne plus passer `refresh=1` depuis la barre des produits quand la session du produit est ouverte, et garder la relecture pour une organisation inconnue du produit (`hgdcRefreshPath`, déjà en place). Gain : environ 2 s par passage ; puis préchargement au survol possible.
2. Ajouter un événement `member.added` poussé par Account (même canal que l'ADR 0014) : la relecture à l'entrée devient inutile.
3. En attendant : garder en cache la découverte OIDC côté serveur, si better-auth la relit à chaque connexion (à mesurer sur le premier saut).

## Ce qu'un domaine unique apporterait en plus

Un seul domaine (par exemple `app.hgdc.ch/<org>/<produit>`) rendrait possibles les View Transitions entre documents (`@view-transition { navigation: auto }`), qui exigent la même origine : le H pourrait littéralement rester à l'écran pendant la navigation, et le prérendu au survol se ferait sans en-tête d'acceptation. Un seul cookie de session supprimerait aussi la chaîne OAuth entre produits (0,45 s au lieu de 2 à 3 s, voire moins).

Ce que ça coûterait :

- **Cookies** : une session commune à tous les produits ; un produit compromis lit la session des autres. Aujourd'hui chaque produit a sa propre session, sur sa propre origine.
- **Clients OAuth** : un seul client pour tous les produits, ou une passerelle qui répartit ; les jetons et les portées par produit (ADR 0004) seraient à revoir.
- **CSP et isolation** : une seule politique, la plus large de tous les produits ; plus d'isolation d'origine entre Mail (envoi d'e-mails, clés d'API) et le reste.
- **Déploiement** : un routage devant tous les projets (réécritures Vercel ou microfrontends), chaque produit servi sous un préfixe.
- **Identité** : un produit n'a plus son adresse (`mail.hgdc.ch`), ses domaines personnalisés et sa documentation (`<produit>.hgdc.ch/docs`) se compliquent.

Recommandation : garder un domaine par produit. La continuité visuelle mesurée (même H, même pixel, même phase) couvre l'essentiel ; le gain qui reste est le temps de la chaîne d'authentification, qui se règle dans `@hgdc/auth` (pistes 1 et 2) sans toucher au domaine.

## Mesures après (0.15.0 en production, 17.10)

Mêmes conditions (Chrome, latence ajoutée de 400 ms ou réseau normal), centre du H relevé à chaque image :

| Cas                                                              | Centre du H                                                                                                           | Élément                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Navigation dans la coque (Host, Account, Analytics)              | 872, 478 du début à la fin                                                                                            | un seul, jamais démonté                                                                                   |
| Host → Mail, Mail → Status, Status → Portal (barre des produits) | 872, 478 sur la page de départ, puis 872, 478 dès la première image de la page d'arrivée, à travers `/o` → `/o/<org>` | un par document, même phase (écart mesuré à l'horloge : 13 à 16 ms dans chaque document, le même partout) |
| Téléphone 390 × 844 (Host, Portal)                               | 195, 450                                                                                                              | un seul                                                                                                   |
| En-tête de la coque                                              | 1114 px de large dans tous les états                                                                                  |                                                                                                           |

Le H apparaît 90 à 120 ms après le clic sur un autre produit (fondu de 150 ms) et reste affiché jusqu'à la page d'arrivée, 2,5 à 3,8 s plus tard selon le réseau, toute la chaîne d'authentification comprise.

## Conséquences

- Chaque produit pose `FamilyLoaderRoot` dans le `body` de sa route racine. Sans lui, la coque et `PagePending` montent chacun leur propre H (même scène, même phase) : rien ne casse, mais deux H peuvent se croiser.
- `FamilyLoader page` et `PagePending` hors de la coque dessinent le cadre de la coque. Une page sans coque qui veut un H centré dans l'écran utilise `FamilyLoader` en ligne dans sa propre mise en page.
- `ContentLoadingStage` est dépréciée ; `useDelayedFlag` reste exportée.
- Maquette : `bun scripts/loader-showcase.tsx`, puis `?t=<ms>` pour figer la boucle (captures par image), `&dark` pour le thème sombre.
