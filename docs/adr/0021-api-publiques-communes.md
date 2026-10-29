---
owner: Hugo Gebel
last_reviewed: 2026-10-29
status: accepted
---

# 0021. API publiques communes : `@hgdc/api`

## Contexte

Chaque produit a écrit seul son API publique et son serveur MCP. Résultat : trois serveurs MCP écrits à la main, six copies de l'empreinte SHA-256 d'un jeton, des préfixes de clé différents (`ah_`, `am_`, `pmcp_`), un tirage de clé biaisé (modulo), un jeton tiré dans une mutation (hasard rejouable sous Convex), aucune erreur au format standard. La spécification MCP a changé le 2026-07-28 : plus de session ni de poignée de main `initialize`, version et capacités dans chaque requête, `server/discover`, en-têtes `Mcp-Method` et `Mcp-Name` contrôlés.

## Décision

Un paquet `@hgdc/api`, sans dépendance autre que `zod`, en Web Crypto seulement (runtime V8 de Convex), découpé en sous-chemins : `keys`, `bearer`, `errors`, `pagination`, `ratelimit`, `mcp`, `openapi`.

### Clés

- Format `hgdc_<produit>_<32 caractères base62 aléatoires><6 caractères base62 de CRC-32>`. Le CRC-32 porte sur le préfixe et l'aléa : une clé recopiée sous un autre produit ou avec une faute est refusée sans lecture en base, et un scanner de secrets la reconnaît (`KEY_PATTERN`). 190 bits d'aléa.
- Tirage base62 par rejet (octet ≥ 248 jeté) : chaque caractère a la probabilité 1/62.
- Génération dans une action Convex uniquement. La base garde l'empreinte SHA-256 et un aperçu (`hgdc_mail_…x9Qa`), jamais la clé.
- Les anciennes clés d'un produit restent acceptées par préfixe déclaré (`classifyKey`), le temps de leur rotation.
- Scopes `<produit>:<droit>` ; `write` inclut `read`, `admin` inclut les deux. Un scope mal formé ne donne aucun droit.
- `lastUsedAt` réécrit une fois par minute au plus (une écriture par requête créerait des conflits de transaction).

### Authentification

- `Authorization: Bearer` seulement (ni paramètre d'URL, ni corps). Comparaison de secrets en temps constant.
- Un refus rend 401 (403 pour `insufficient_scope`) en problem+json, avec `WWW-Authenticate: Bearer resource_metadata="<document RFC 9728>"`. Chaque produit sert son document de ressource protégée ; le serveur d'autorisation annoncé est Account.

### Erreurs

- RFC 9457 : `type` stable sous `https://hgdc.ch/problems/<cas>`, `title` fixe par type, `detail` pour une personne, sans détail interne. Erreurs de champ dans `errors: [{ pointer, detail }]`.
- Les routes qui imitent Resend (Mail) ou Vercel (Host) gardent le format de ces services par un adaptateur, pour que leurs SDK lisent nos erreurs.

### Pagination et limites

- Curseur opaque versionné autour du `continueCursor` de Convex, enveloppe `{ data, next_cursor, has_more }`, `limit` de 1 à 100 (20 par défaut).
- Limites par `@convex-dev/rate-limiter` (préréglages communs), en-têtes `RateLimit-Policy` et `RateLimit` du brouillon IETF (version 11) et `Retry-After` sur 429. L'IP du client se lit de droite à gauche dans `X-Forwarded-For`.

### MCP

- Un serveur par produit, gestionnaire `(Request) => Response`, sans état, réponses JSON (jamais de flux SSE ni de session).
- Révision 2026-07-28 servie en priorité ; 2025-11-25 et 2025-06-18 par `initialize`, pour les clients pas encore passés. Aucun lot JSON-RPC (aucune des trois ne les admet). GET et DELETE : 405. `Origin` d'un autre site : 403. Corps limité à 1 Mio.
- Les outils viennent du `ToolSet` de l'assistant du produit (`@hgdc/assistant/tools`) : mêmes noms, mêmes schémas, mêmes classes. La classe donne les indications : `read` lecture seule, `write` non destructif, `confirm` destructif et ouvert sur l’extérieur (le client demande confirmation, MCP n’a pas la carte « Confirmer »), `send` (hgdc-kit#195) ouvert sur l’extérieur, ni en lecture seule ni rejouable. `title`, `annotations` et `output` (schéma du résultat, rendu en `outputSchema` et `structuredContent` vérifié) s'ajoutent au `ToolSpec`.
- Erreurs : outil inconnu ou masqué et `arguments` qui n'est pas un objet en JSON-RPC `-32602` ; arguments refusés par le schéma en résultat `isError: true`, comme le demande la spécification (le modèle peut corriger) ; exception imprévue en `-32603` générique, remontée par `onError`.
- L'authentification est fournie par le produit (callback qui rend un contexte ou une `Response`) : clé d'API ou jeton OAuth d'Account, au choix du produit. `canUse` masque les outils que le jeton ne peut pas appeler.
- Carte du serveur au format SEP-2127 (`<adresse MCP>/server-card`), sans liste d'outils ; un catalogue AI Catalog recense les cartes d'un domaine.

## Conséquences

- Les produits migrent un par un : clés neuves au format commun, anciennes acceptées jusqu'à leur rotation ; serveurs MCP écrits à la main remplacés par `createMcpHandler`. Chaque migration se teste dans le produit.
- Les pages `https://hgdc.ch/problems/<cas>` sont à publier sur le site : d'ici là, les URI restent des identifiants stables.
- Nouveau paquet : premier envoi sur npm à la main (`docs/runbooks/publier.md`).
- `@convex-dev/rate-limiter` entre dans la stack (`stack.json`). Les paquets `@hgdc/*` n'y entrent pas : la propagation (`propagate.yml`) ne pousse que `@hgdc/config` et `@hgdc/ui`, et `hgdc-stack sync` ferait sauter plusieurs versions mineures d'un coup (0.x : rupture possible) aux produits en retard, ce qui bloquerait leur PR de propagation. Préalable : propager tous les `@hgdc/*` dans la même PR, réécrire leurs versions dans `stack.json` à chaque release (`changeset version`), puis aligner les produits en retard un par un.
