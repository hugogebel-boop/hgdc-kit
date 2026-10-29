# @hgdc/api

Le socle des API publiques des produits de la H Collection : clés d'API, authentification Bearer, erreurs, pagination, limites de débit, serveur MCP et spécification OpenAPI. Une règle commune, écrite une fois (ADR 0021).

Web Crypto et fonctions pures seulement : tourne dans le runtime V8 de Convex (sans Node), dans une route TanStack Start, dans Bun et dans Node 22.18+. Seule dépendance : `zod` 4.

```sh
bun add @hgdc/api
```

| Sous-chemin            | Contenu                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hgdc/api/keys`       | Clés `hgdc_<produit>_<corps>` : génération (dans une action), somme de contrôle vérifiable hors ligne, `hashKey` SHA-256, `keyPreview`, `classifyKey` (anciennes clés), scopes `<produit>:read\|write\|admin`, statut et `lastUsedAt` |
| `@hgdc/api/bearer`     | `extractBearer`, `safeEqual` (temps constant), `unauthorized()` (401 ou 403 avec `WWW-Authenticate: Bearer resource_metadata="…"`), document RFC 9728 et son adresse                                                                  |
| `@hgdc/api/errors`     | problem+json RFC 9457, catalogue de types stables, erreurs de champ Zod, dialectes `resend` et `vercel`                                                                                                                               |
| `@hgdc/api/pagination` | Curseur opaque, enveloppe `{ data, next_cursor, has_more }` depuis `.paginate()` de Convex                                                                                                                                            |
| `@hgdc/api/ratelimit`  | Préréglages pour `@convex-dev/rate-limiter`, en-têtes `RateLimit-Policy`, `RateLimit`, `Retry-After`, IP du client                                                                                                                    |
| `@hgdc/api/mcp`        | Serveur MCP Streamable HTTP sans état (révisions 2026-07-28, 2025-11-25, 2025-06-18), outils dérivés d'un `ToolSet` de `@hgdc/assistant`, carte du serveur (SEP-2127)                                                                 |
| `@hgdc/api/openapi`    | OpenAPI 3.1 depuis Zod 4, composants problem+json et pagination                                                                                                                                                                       |

## Exemple : serveur MCP dans un `httpAction` Convex

```ts
// convex/http.ts
import { httpRouter } from "convex/server"
import { unauthorized, extractBearer, protectedResourceMetadataUrl } from "@hgdc/api/bearer"
import { hashKey, classifyKey, parseScopes, hasScope } from "@hgdc/api/keys"
import { createMcpHandler } from "@hgdc/api/mcp"
import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { TOOLS } from "./assistant/tools"

const RESOURCE = "https://app.hgdc.ch/mail/mcp"
const challenge = { resourceMetadata: protectedResourceMetadataUrl(RESOURCE) }
const http = httpRouter()

http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const handle = createMcpHandler({
      server: { name: "mail", title: "Mail", version: "1.0.0" },
      instructions: "Mail : domaines, envois, campagnes. Commence par list_domains.",
      tools: TOOLS,
      authenticate: async (req) => {
        const token = extractBearer(req)
        if (!token) return unauthorized(challenge)
        if (classifyKey(token, { product: "mail", legacyPrefixes: ["am_"] }) === "invalid")
          return unauthorized({ ...challenge, error: "invalid_token" })
        const key = await ctx.runQuery(internal.apiKeys.byHash, { hash: await hashKey(token) })
        return key
          ? { orgId: key.orgId, scopes: parseScopes(key.scopes) }
          : unauthorized({ ...challenge, error: "invalid_token" })
      },
      canUse: (auth, _name, tool) => tool.kind === "read" || hasScope(auth.scopes, "mail:write"),
      execute: ({ name, input, context }) => ctx.runAction(internal.mcp.run, { name, input, orgId: context.orgId }),
    })
    return await handle(request)
  }),
})
export default http
```

GET et DELETE sur la même adresse rendent 405 : les déclarer dans le routeur avec le même `handler` si le client doit voir ce statut plutôt que le 404 du routeur. Servir aussi `GET /mcp/server-card` (`serverCardResponse`) et le document `/.well-known/oauth-protected-resource/<chemin>` (`protectedResourceMetadataResponse`).

## Règles

- **Générer une clé dans une action**, jamais dans une query ou une mutation : Convex y rend le hasard déterministe. L'action tire la clé (`createKey`), puis une mutation interne enregistre l'empreinte et l'aperçu. La clé ne se montre qu'une fois.
- **Ne garder que l'empreinte** (`hashKey`) et chercher par index sur elle. Comparer un secret reçu à un secret connu avec `safeEqual` ou `safeEqualHash`, jamais `===`.
- **Anciennes clés** (`am_`, `ah_`, `pmcp_`) : `classifyKey(…, { legacyPrefixes })` les accepte pendant la migration ; leur empreinte se cherche comme les autres.
- **Scopes** : `<produit>:read`, `<produit>:write` (donne `read`), `<produit>:admin` (donne les deux). Un scope mal formé ne donne rien.
- **Erreurs** : `problem(slug, { detail })`. `detail` est lu par une personne : jamais de message interne. Les routes compatibles Resend (Mail) ou Vercel (Host) répondent par `dialectResponse(…, "resend" | "vercel")`.
- **MCP** : un outil `confirm` est annoncé destructif ; le client demande confirmation. Une erreur prévue se lève en `ToolError` (montrée au modèle), toute autre exception devient une erreur interne générique et passe par `onError` (GlitchTip).
- **Limites** : consommer `authFailure` par IP sur chaque refus d'authentification, `apiKeyRead` ou `apiKeyWrite` par clé, `mcp` par jeton.
