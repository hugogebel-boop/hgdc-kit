---
"@hgdc/auth": minor
---

Sign-in rate limit shared by every product.

- `restoreClientAddress` never keeps a client-written `x-forwarded-for` without a valid signature. It now always sets `x-forwarded-for`, `x-real-ip` and the new `x-hgdc-rate-limit-address` to one address: the signed one, else the reverse proxy address when `trustForwardedFor: true` (a proxy you run that overwrites `x-forwarded-for`), else the neutral key `NEUTRAL_CLIENT_ADDRESS` (`0.0.0.0`, one shared limit). Third argument: `{ now, trustForwardedFor }` (a number still works as `now`).
- `HGDC_IP_ADDRESS_OPTIONS` for better-auth `advanced.ipAddress`: reads only the header set by `restoreClientAddress`.
- New `@hgdc/auth/rate-limit`: `SERVER_AUTH_PATHS` (server-called paths never limited), `HGDC_RATE_LIMIT` (database storage, those paths excluded), `purgeAuthRateLimitArgs` and `purgeAuthRateLimitBatch` (hourly purge of the `rateLimit` table).

Behaviour change: behind a trusted reverse proxy, pass `trustForwardedFor: true`, or unsigned calls share the neutral key.
