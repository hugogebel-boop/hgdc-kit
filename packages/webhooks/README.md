# @hgdc/webhooks

Webhooks signés des produits HGDC, au format [Standard Webhooks](https://www.standardwebhooks.com/) : signature et vérification, secret `whsec_`, garde SSRF des adresses, calendrier de reprises. Fonctions pures (Web Crypto), sauf `resolvesPublicly` qui lit le DNS par DNS-over-HTTPS. Aucune dépendance, aucune variable d'environnement : Convex, navigateur, Bun et Node. La file de livraison et les tables restent dans chaque produit.

```sh
bun add @hgdc/webhooks
```

| Fonction                                             | Rôle                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `generateSecret()`, `SECRET_PATTERN`                 | Secret `whsec_<base64>` de 32 octets, et sa forme                                                  |
| `sign(secret, id, timestamp, body)`                  | `v1,<base64>` : HMAC-SHA256 de `id.timestamp.corps`                                                |
| `signedHeaders(secret, id, timestamp, body)`         | `webhook-id`, `webhook-timestamp`, `webhook-signature` et `content-type`                           |
| `verify({ secret, id, timestamp, signature, body })` | `ok`, `invalid` ou `expired` (plus de 5 minutes d'écart, réglable) ; comparaison en temps constant |
| `RETRY_DELAYS_MS`, `MAX_ATTEMPTS`, `retryDelay(n)`   | Huit essais : tout de suite, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h                              |
| `isDelivered(status)`, `DELIVERY_TIMEOUT_MS`         | 2xx seulement, 10 s de délai                                                                       |
| `parseWebhookUrl(input)`                             | Adresse d'un endpoint : https, port 443, nom public ; lève une `Error` lisible sinon               |
| `isPublicUrl(url, options?)`, `isPrivateIp(ip)`      | Pas d'IP, de nom interne, d'identifiants, de port inhabituel ; IPv4 dans IPv6 comprise             |
| `resolvesPublicly(url, lookup?)`, `dohLookup()`      | Le nom ne pointe que vers des adresses publiques. À refaire avant chaque essai                     |

## Émettre

```ts
import {
  DELIVERY_TIMEOUT_MS,
  generateSecret,
  isDelivered,
  parseWebhookUrl,
  resolvesPublicly,
  retryDelay,
  signedHeaders,
} from "@hgdc/webhooks"

const secret = generateSecret() // à tirer dans une action Convex : le hasard d'une mutation n'est pas secret
const url = parseWebhookUrl(input) // à la création de l'endpoint

// À chaque essai : même `id` pour tous les essais d'un message, `timestamp` renouvelé.
if (!(await resolvesPublicly(url))) throw new Error("Adresse refusée")
const response = await fetch(url, {
  method: "POST",
  headers: await signedHeaders(secret, "msg_123", Math.floor(Date.now() / 1000), body),
  body,
  redirect: "manual", // jamais suivie
  signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
})
const delay = isDelivered(response.status) ? null : retryDelay(attempt) // `null` : succès ou abandon
```

## Recevoir

```ts
import { verify } from "@hgdc/webhooks"

const body = await request.text() // le corps brut, avant JSON.parse
const verdict = await verify({
  secret,
  id: request.headers.get("webhook-id"),
  timestamp: request.headers.get("webhook-timestamp"),
  signature: request.headers.get("webhook-signature"),
  body,
})
if (verdict !== "ok") return new Response(null, { status: 401 })
```

Un récepteur retient aussi les `webhook-id` déjà vus : un message capturé et rejoué dans la fenêtre de 5 minutes reste signé.

## Requête sortante sûre (Node)

`resolvesPublicly` lit le DNS, puis `fetch` le résout une seconde fois : un DNS qui change de réponse entre les deux (rebinding, TTL nul) passe. Dans un runtime Node (action Convex `"use node"`), utiliser `safeFetch`, qui ferme ce trou :

```ts
import { SafeFetchError, safeFetch } from "@hgdc/webhooks/safe-fetch"

const res = await safeFetch(url, { method: "POST", headers, body, timeoutMs: 10_000, maxBytes: 64_000 })
```

- chaque saut passe `isPublicUrl`, puis le nom est résolu une fois : une seule adresse privée, de boucle locale, link-local, de métadonnées ou IPv6 ULA, et tout est refusé ;
- la connexion vise l'adresse vérifiée (option `lookup` de `node:https`), `Host` et SNI gardent le nom d'origine ;
- redirections refusées par défaut ; avec `maxRedirects`, chacune est revérifiée ;
- délai total et taille de la réponse bornés. Une erreur est une `SafeFetchError` au `code` stable (`unsafe_url`, `private_address`, `dns`, `timeout`, `too_large`, `too_many_redirects`, `network`).

Sans Node (runtime par défaut de Convex, Workers), aucune parade complète : garder `resolvesPublicly`, pas de cookies ni d'identifiants, redirections refusées, réponse jamais rendue.
