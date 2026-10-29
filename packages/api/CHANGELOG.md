# @hgdc/api

## 0.1.0

### Minor Changes

- e7db377: Premier envoi : `@hgdc/api`, le socle des API publiques des produits. Clés `hgdc_<produit>_…` avec somme de contrôle vérifiable hors ligne, tirage base62 sans biais, empreinte SHA-256, aperçu, scopes `<produit>:read|write`, anciennes clés acceptées (`/keys`) ; jeton Bearer, comparaison en temps constant, 401 avec `resource_metadata` et document RFC 9728 (`/bearer`) ; erreurs problem+json RFC 9457 et dialectes Resend et Vercel (`/errors`) ; pagination par curseur opaque compatible avec `.paginate()` de Convex (`/pagination`) ; préréglages de `@convex-dev/rate-limiter` et en-têtes RateLimit (`/ratelimit`) ; serveur MCP Streamable HTTP sans état (2026-07-28, 2025-11-25, 2025-06-18), outils dérivés d'un `ToolSet`, carte du serveur (`/mcp`) ; OpenAPI 3.1 depuis Zod 4 (`/openapi`). Web Crypto seulement : tourne dans Convex.
