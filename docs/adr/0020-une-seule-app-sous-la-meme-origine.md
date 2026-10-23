---
owner: Hugo Gebel
last_reviewed: 2026-10-23
status: accepted
---

# 0020. Passer d'un produit à l'autre comme dans une seule app, sous la même origine

## Contexte

Analytics, Mail, Host et Docs sont servis sous `https://app.hgdc.ch/<produit>` (`PRODUCT_ORIGINS`). Chacun reste une app séparée : passer de l'un à l'autre est une navigation de document. Demande de Hugo : que cela se sente comme une seule app. La barre des produits et la barre latérale restent en place, le H qui charge s'affiche, pas de flash blanc.

L'ADR 0015 notait ce qu'une origine unique rendrait possible : transitions de vue entre documents et prérendu sans en-tête d'acceptation. L'ADR 0016 écartait le prérendu, parce que la page d'arrivée consomme un cookie et ouvre un cadre.

## Décision

Uniquement des standards du web, dans `@hgdc/ui` :

1. **Transition de vue entre documents** (`@view-transition { navigation: auto; }` dans `styles.css`, sous `prefers-reduced-motion: no-preference`). Noms stables : `hgdc-product-rail` (barre des produits), `hgdc-sidebar` (barre latérale), `hgdc-header` (barre du haut). Même position des deux côtés : elles ne bougent pas, leur contenu passe en fondu en place (200 ms, `--ease-ios`). Le reste de la page passe en fondu de 150 ms. Le navigateur garde l'ancienne page jusqu'à ce que la nouvelle soit prête à peindre : pas de page blanche. Mouvement réduit : aucune transition. Le navigateur n'en fait pas entre deux origines, ni derrière une redirection vers Account (pas de session dans le produit d'arrivée).
2. **Liens de la barre** : un produit servi sous l'origine de la page (`location.origin`, lue après l'hydratation) reçoit un lien relatif (`/mail/auth/hgdc?refresh=background&next=/`) marqué `data-hgdc-prerender`. Le produit courant pointe vers sa base (`/mail/`) : `/` menait à la racine de `app.hgdc.ch`. Au rendu serveur et en développement (autre origine), les liens restent absolus, comme avant.
3. **Prérendu au survol** (Speculation Rules, `PRODUCT_SPECULATION_RULES`) : `prerender`, `eagerness: "moderate"` (environ 200 ms de survol, ou l'appui), sur les liens marqués dont l'adresse suit le motif relatif `/*/auth/hgdc?refresh=background*`, donc de la même origine seulement. Les produits encore sur leur sous-domaine gardent le préchargement de l'ADR 0016. L'entrée de `@hgdc/auth` reste telle quelle : session du produit ouverte, elle rend sa redirection (le prérendu suit) ; sans session, elle répond 503 à `Sec-Purpose: prefetch;prerender`, le navigateur jette le prérendu et le clic repart normalement.
4. **Page prérendue** : `startBackgroundRefresh` attend `prerenderingchange` (`document.prerendering`). Un survol sans clic ne relit pas les organisations et n'ouvre aucun cadre.
5. **Le H du départ** : le clic sur un autre produit couvre la zone de contenu du H après 100 ms (`PRODUCT_LEAVE_DELAY_MS`), plus aussitôt. Une page prérendue s'affiche avant : pas de H. Sinon le H reste jusqu'au départ, et la page d'arrivée montre le sien au même pixel (ADR 0015). Au clic, la barre des produits se replie, comme un menu qui se ferme : la page d'arrivée la montre repliée, rien ne bouge au passage.
6. **État partagé** : sous la même origine, `localStorage` et les cookies `Path=/` sont communs.
   - Communs voulus : `theme` (thème), `sidebar` (barre latérale réduite).
   - Propres au produit : les groupes repliables (`sidebar-group:<produit>:<titre>`, ils étaient `sidebar-group:<titre>`).
   - Cookie `hgdc-org-sync` (`@hgdc/auth`) : sous `appBasePath`, limité à ce chemin et portant ce chemin (`hgdc-org-sync=/mail; Path=/mail`). Avant, un passage vers Mail posait un cookie `Path=/` que le premier produit chargé consommait, et le cadre s'ouvrait à `/auth/hgdc` hors de toute base. Le cadre s'ouvre maintenant sous la base lue dans le cookie (`/mail/auth/hgdc?refresh=1&frame=1`).
   - Les clés des produits restent les leurs : préfixées par le produit (`hgdc-docs:`, `agenthost:`, `mail:last-org`), sauf trois de Mail (`composer-tip-seen`, `composer-panel`, `assistant-window`). Rien ne les écrase aujourd'hui ; les préfixer à la prochaine modification.
7. **La barre des produits ne bouge pas, le H ne s'interrompt pas** (0.39, après le test de Hugo du 2026-10-23 : « le fond reste, mais le workspace et les icônes s'effacent »).
   - Cause : la page d'arrivée ne peignait pas la même barre. Mail répond `/` par `/o`, qui attend hors de la coque (l'organisation se choisit dans le navigateur) : sa première image était le cadre du chargeur, fond de la barre seul. La transition faisait donc sortir l'ancienne barre en fondu (pas d'élément nommé en face), puis la coque montait sans organisation (pastilles remontées de 57 px), puis l'organisation arrivait (pastilles redescendues). Le H, pris dans l'image de la page entière, passait en fondu avec elle.
   - Une barre identique des deux côtés : le cadre du chargeur dessine la coque (`ShellFrame` : barre des produits complète, marque du produit, navigation en squelette, barre du haut), sous les mêmes noms de transition. Sans `organization`, la coque tient sa place (`OrgPlaceholder`). La marque montrée est celle de la dernière organisation affichée sous l'origine : `OrgSwitcher` retient ses initiales et son logo (`localStorage`, `hgdc-shell:org`), `sidebarInitScript` les pose sur `<html>` avant la première peinture, `AccountMenu` les oublie à la déconnexion. Sans mémoire, un squelette de la même taille. Le produit de l'adresse (`PRODUCT_ORIGINS`, ou le sous-domaine) marque l'indicateur et choisit la marque de la barre latérale ; la hauteur retenue de sa navigation (`hgdc-shell:nav:<produit>`) règle le squelette.
   - Pas d'animation sur `hgdc-product-rail` ni sur le nouveau `hgdc-loader` (le H) : ancienne image masquée, nouvelle affichée telle quelle, vivante. Présents d'un seul côté (`:only-child`), fondu de 150 ms. La barre latérale et la barre du haut gardent leur fondu en place de 200 ms (le produit change), le reste 150 ms.
   - Le H d'arrivée reprend à la même phase : déjà calé sur l'horloge (ADR 0015) ; sans fondu, l'image du départ et celle de l'arrivée ne se superposent plus.
   - Au clic, la barre se replie sans transition (`<html data-hgdc-switching>`) : l'image de départ est déjà celle de l'arrivée. La page d'arrivée ne s'élargit pas sous la souris restée sur la barre (`sessionStorage`, `hgdc-shell:switch`) ; il faut en sortir une fois.
   - Écartés : un squelette seul à la place de l'organisation (la marque change à chaque passage) ; recopier le HTML de la barre d'une page à l'autre (`pageswap`) : le HTML du serveur n'en dispose pas, et un script qui réécrit le DOM avant l'hydratation casse React ; `<link rel="expect" blocking="render">` : rien à attendre, la barre est dans le premier morceau du HTML, et une page sans barre retarderait sa première peinture jusqu'à la fin du document.

## Navigateurs

| Fonction                                               | Chrome, Edge | Safari        | Firefox                         |
| ------------------------------------------------------ | ------------ | ------------- | ------------------------------- |
| Transition de vue entre documents (`@view-transition`) | oui (126+)   | oui (18.2+)   | non (derrière un drapeau, 2026) |
| `pageswap`, `pagereveal`                               | oui          | oui (18.2+)   | non                             |
| Speculation Rules (`prerender`, `prefetch`)            | oui          | non (drapeau) | non                             |

Là où rien n'est pris en charge : une navigation ordinaire, le H de l'ancienne page jusqu'au départ, puis celui de la page d'arrivée au même pixel (ADR 0015). Le script de règles n'est posé que si `HTMLScriptElement.supports("speculationrules")`.

## CSP

Les règles sont un `<script type="speculationrules">` en ligne, inséré par la coque. Aujourd'hui aucun produit ne pose `script-src` : rien à changer. Un produit qui en pose un doit y ajouter `'inline-speculation-rules'` (sans cela, Chrome ignore les règles, rien ne casse). Écartés : l'en-tête `Speculation-Rules` vers un fichier JSON (un fichier à servir et un en-tête sur chaque document, par produit) et un `nonce` (le rendu des produits ne le propage pas).

## Vérification (2026-10-23)

Page de test locale : deux « produits » sous la même origine, coque du kit rendue par le serveur puis hydratée, entrée simulée (302 avec cookie de relecture, 503 à un prérendu sans session), document de Mail servi en 900 ms. Chrome 145, 1440 × 900.

| Cas                         | Observé                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Survol de Mail sans session | une requête `Sec-Purpose: prefetch;prerender` vers l'entrée, 503, rien d'autre                                                                                                                                        |
| Clic sans prérendu          | H sur le contenu de l'ancienne page au départ, transition de vue des deux côtés ; barre des produits (0, 0, 56 × 900), barre latérale (56, 0, 256 × 900), barre du haut (312, 8, 1110 × 56) identiques avant et après |
| Survol de Mail avec session | entrée puis `/mail/` prérendus pendant le survol                                                                                                                                                                      |
| Clic après le survol        | aucune requête de document, URL de Mail en 150 ms, pas de H ; le cadre de relecture (`/mail/auth/hgdc?refresh=1&frame=1`) part après l'activation, jamais pendant le survol                                           |
| Mouvement réduit            | pas de transition de vue, navigation ordinaire                                                                                                                                                                        |

Le Chromium de Playwright coupe toute spéculation : vérifier le prérendu dans un vrai Chrome.

### Barre immobile et H continu (0.39, 2026-10-23)

Même page de test locale (hors dépôt), Mail comme en production : `/mail/` répond `/mail/o`, page qui attend hors de la coque, puis coque sans organisation, puis coque complète (`?step=` règle chaque étape, 400 ms par défaut) ; document de Mail servi en 900 ms, entrée en 600 ms. Chrome 156 lancé seul, piloté par CDP (le Chrome lancé par Playwright retarde de 300 ms la première image de toute transition de vue, même entre deux pages vides : 330 ms contre 60 ms sans Playwright). Images relevées par `Page.startScreencast` (60 par seconde), 1440 × 900, comparées à l'image finale, pastille par pastille (écart moyen sur 255).

| Cas                                          | 0.38                                                                                                                         | 0.39                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Analytics → Mail, sans survol                | barre entière en fondu, puis fond seul, puis pastilles sans organisation : écart jusqu'à 111 (organisation), 150 (pastilles) | écart constant de 3,2 et 2,0 avant le clic, pendant et après le passage ; seul l'indicateur change |
| Analytics → Mail, survol de 400 ms puis clic | même chose                                                                                                                   | même chose qu'en haut ; la barre élargie se replie dans l'image du clic                            |
| Mail → Analytics (coque complète au serveur) | écart nul                                                                                                                    | écart nul                                                                                          |
| H au passage                                 | ancienne image figée en fondu sur la nouvelle                                                                                | présent à chaque image, remplissage continu d'une page à l'autre                                   |
| Image figée entre le départ et l'arrivée     | 61 ms                                                                                                                        | 55 ms (49 ms après un survol)                                                                      |
| Après l'arrivée, souris sur la barre         | la barre s'élargit sous la souris                                                                                            | reste repliée                                                                                      |
| Mouvement réduit                             | navigation ordinaire                                                                                                         | navigation ordinaire (`pageswap` sans transition), H plein immobile, barre identique               |

Ordre d'apparition à l'arrivée sur Mail : barre des produits complète dès la première image ; marque de Mail et navigation en squelette dans la même image (fondu de 200 ms depuis celle d'Analytics) ; onglets réels 400 ms plus tard (coque montée) ; contenu à la fin, le H restant jusque-là.

## Conséquences

- Chaque produit monte à `@hgdc/ui` 0.38 et `@hgdc/auth` (version du même changeset) : rien d'autre à écrire. Les deux produits d'un passage doivent porter la version pour que la transition se fasse (chacun déclare `@view-transition`) ; sinon, navigation ordinaire. Pour la barre immobile (point 7), `@hgdc/ui` 0.39 des deux côtés ; un produit qui attend ses données rend `AppShell` sans `organization` (pas `null`).
- L'origine retient des initiales, un logo (`https:`) et des hauteurs, jamais un nom : sur un poste partagé, la personne suivante peut voir les initiales de la dernière organisation dans le cadre de chargement, jusqu'à sa propre connexion ; la déconnexion par `AccountMenu` les efface.
- Une page prérendue exécute son JavaScript (Convex se connecte, les requêtes partent) avant d'être vue. Un produit qui compte une visite ou déclenche un effet au chargement doit attendre `document.prerendering === false` (`prerenderingchange`). Chrome limite à deux prérendus `moderate` à la fois.
- Les états mémorisés des groupes repliables repartent fermés une fois (nouvelle clé).
- L'ADR 0016 n'interdit plus le prérendu sous la même origine ; son préchargement des sous-domaines reste.
