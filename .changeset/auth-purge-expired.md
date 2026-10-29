---
"@hgdc/auth": minor
---

New `@hgdc/auth/expired`: `purgeExpiredAuthArgs` and `purgeExpiredAuthBatch` delete expired better-auth `session` rows, then expired `verification` rows, in batches of 500 through the component adapter (`expiresAt < now`, `expiresAt` index). better-auth only deletes an expired session when it reads it again, so abandoned sessions kept their IP address and user agent forever. Valid sessions are never touched. Run it hourly from a product cron starting at `{ model: "session", cursor: null }`.
