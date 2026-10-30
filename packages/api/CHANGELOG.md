# @hgdc/api

## 0.2.1

### Patch Changes

- 1866f4c: Stack : better-auth 1.6.33 (GHSA-qq9h-g4jm-xgf3, prise de compte par un mot de passe posé avant la connexion par lien magique ou code e-mail), zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, mémoire épuisée par un grand tableau). `@better-auth/oauth-provider` et `@better-auth/passkey` entrent dans la stack, à la même version que better-auth. `@hgdc/auth` demande better-auth 1.6.22 au moins ; `@hgdc/auth`, `@hgdc/api` et `@hgdc/assistant` demandent zod 4.6.7 au moins.

## 0.2.0

### Minor Changes

- d4de156: MCP step-up and ASCII challenges.
  
  - `@hgdc/auth/mcp`: `McpTokenError.scope` names the missing scope (`<product>:read` or `<product>:write`) on `insufficient_scope`. New `mcpTokenChallenge(error)` returns the Bearer challenge to spread into `unauthorized()`: `{ error: "invalid_token" }` (401) or `{ error: "insufficient_scope", scope }` (403, RFC 6750 § 3.1, MCP authorization step-up). The 403 now names the missing scope (`scope="<product>:read"`), so an MCP client can step up instead of failing.
  - `@hgdc/api/bearer`: every `WWW-Authenticate` parameter is printable ASCII (`asciiChallengeText`: accents stripped, typographic quotes and dashes folded, `"` and `\` dropped), as RFC 6750 § 3 requires for `error_description` (`œ`, `æ`, `ß` spelled out); a parameter left empty is omitted. The accented message stays in the problem+json `detail`.

## 0.1.0

### Minor Changes

- e7db377: Premier envoi : `@hgdc/api`, le socle des API publiques des produits. Clés `hgdc_<produit>_…` avec somme de contrôle vérifiable hors ligne, tirage base62 sans biais, empreinte SHA-256, aperçu, scopes `<produit>:read|write`, anciennes clés acceptées (`/keys`) ; jeton Bearer, comparaison en temps constant, 401 avec `resource_metadata` et document RFC 9728 (`/bearer`) ; erreurs problem+json RFC 9457 et dialectes Resend et Vercel (`/errors`) ; pagination par curseur opaque compatible avec `.paginate()` de Convex (`/pagination`) ; préréglages de `@convex-dev/rate-limiter` et en-têtes RateLimit (`/ratelimit`) ; serveur MCP Streamable HTTP sans état (2026-07-28, 2025-11-25, 2025-06-18), outils dérivés d'un `ToolSet`, carte du serveur (`/mcp`) ; OpenAPI 3.1 depuis Zod 4 (`/openapi`). Web Crypto seulement : tourne dans Convex.
