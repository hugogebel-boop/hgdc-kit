---
"@hgdc/auth": minor
---

`createAuthProxy`: new `addressSecret` option signs the visitor address (HMAC-SHA-256, bound to method, path and time, 60 s). `restoreClientAddress(request, secret)` on the Convex side puts a valid signed address in `x-forwarded-for` before better-auth, so its per-IP rate limit no longer counts every visitor as the front server. Unsigned, forged or stale headers are dropped and the reverse proxy address is kept.

The address comes from `x-real-ip` only (set by Host's edge or Vercel), never `x-forwarded-for`. Use one secret per product: the signature does not cover the host.
