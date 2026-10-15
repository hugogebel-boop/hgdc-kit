---
owner: Hugo Gebel
last_reviewed: 2026-10-15
status: accepted
---

# 0008. `@hgdc/errors` : remontée d'erreurs vers GlitchTip, sans SDK

## Contexte

Host, Mail, Portal, Analytics et Docs portaient chacun une copie du même module de remontée vers GlitchTip (`convex/lib/errorReport.ts`, `src/lib/error-reporting.ts`), qui dérivaient : Analytics masquait les IP et les identifiants d'URL, les autres non ; seul son collecteur limitait le débit. Chaque correction se faisait cinq fois.

## Décision

- **Un paquet, quatre entrées** : le cœur pur (`@hgdc/errors`, aucun import ni variable d'environnement) et une enveloppe par environnement, `/convex`, `/browser`, `/server`. Aucune dépendance, aucun `peerDependency` : une `ConvexError` est reconnue par son nom.
- **Pas de SDK Sentry** : il ne tourne pas dans l'isolat de Convex et pèserait trente fois le module dans le navigateur. L'enveloppe du protocole Sentry est écrite à la main et postée en `text/plain` (pas de requête préalable CORS).
- **Nettoyage au plus large des copies**, appliqué au message, à la pile et aux chaînes du contexte : e-mails, IP v4 et v6, identifiants d'URL, paramètres sensibles d'une requête, en-têtes `Bearer`/`Basic`, clés à préfixe, longs jetons. Les préfixes de clés courtes d'un produit passent par `keyPrefixes`.
- **Jamais bloquant** : rien ne rejette ; 5 s au plus par envoi ; côté serveur Bun ou Node, l'envoi part au tour suivant de la boucle, une remontée par source et par minute, 30 par heure ; côté navigateur, une fois par erreur et dix par page.
- **Premier envoi manuel** : npm ne déclare un trusted publisher que sur un paquet qui existe. `scripts/publish.ts` saute en CI tout paquet absent de npm (avertissement dans le journal) au lieu d'échouer, et n'étiquette que ce qu'il a publié, en écrivant lui-même les événements `git-tag` que lit changesets/action.

## Conséquences

- Un produit remplace ses copies par le paquet (guide d'adoption, section 9) ; le DSN reste le sien (`GLITCHTIP_DSN`, `VITE_GLITCHTIP_DSN`).
- Un nouveau paquet du kit passe toujours par un premier envoi depuis le poste ([runbook](../runbooks/publier.md)) ; jusque-là, ses versions s'accumulent sans bloquer la release des autres.
- La version déployée (`GLITCHTIP_RELEASE`, le SHA du commit) est facultative ; posée, GlitchTip groupe les erreurs par version.
