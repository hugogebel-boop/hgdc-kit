# @hgdc/errors

## 0.1.0

### Minor Changes

- 55d82ce: Premier paquet de remontée d'erreurs de la famille, repris du module que Host, Mail, Portal, Analytics et Docs copiaient chacun. Enveloppe Sentry postée à GlitchTip par `fetch`, sans SDK ; nettoyage du message, de la pile et du contexte (e-mails, IP v4 et v6, identifiants d'URL, paramètres `token`/`code`/`key`, en-têtes `Bearer`, clés à préfixe, longs jetons) ; jamais d'échec ni d'attente pour l'appelant. `@hgdc/errors/convex` (`reportServerError`, lit `GLITCHTIP_DSN`), `@hgdc/errors/browser` (`createBrowserReporter`, une fois par erreur et dix par page), `@hgdc/errors/server` (`createErrorReporter` pour Bun et Node, envoi différé et limité en débit). Une `ConvexError` ne remonte pas.
