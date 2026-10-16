---
"@hgdc/auth": minor
---

Événements d'organisation poussés par Account (`@hgdc/auth/events`, ADR 0014) : `signAccountEvent` côté Account, `verifyAccountEvent` et `handleAccountEventRequest` côté produit (HMAC-SHA256 en Web Crypto, identifiant d'événement dans le MAC, fenêtre de 5 minutes, corps plafonné), schéma `accountEventSchema` (`member.removed`, `member.role_changed`, `organization.deleted`), `accountEventIsStale`. Pour Convex, `vAccountEvent` et `accountEventsTable` (événements déjà traités, pour l'idempotence).
