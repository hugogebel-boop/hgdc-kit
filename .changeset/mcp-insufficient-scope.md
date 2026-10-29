---
"@hgdc/auth": minor
"@hgdc/api": minor
---

MCP step-up and ASCII challenges.

- `@hgdc/auth/mcp`: `McpTokenError.scope` names the missing scope (`<product>:read` or `<product>:write`) on `insufficient_scope`. New `mcpTokenChallenge(error)` returns the Bearer challenge to spread into `unauthorized()`: `{ error: "invalid_token" }` (401) or `{ error: "insufficient_scope", scope }` (403, RFC 6750 § 3.1, MCP authorization step-up). The 403 now names the missing scope (`scope="<product>:read"`), so an MCP client can step up instead of failing.
- `@hgdc/api/bearer`: every `WWW-Authenticate` parameter is printable ASCII (`asciiChallengeText`: accents stripped, typographic quotes and dashes folded, `"` and `\` dropped), as RFC 6750 § 3 requires for `error_description` (`œ`, `æ`, `ß` spelled out); a parameter left empty is omitted. The accented message stays in the problem+json `detail`.
