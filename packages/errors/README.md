# @hgdc/errors

Remontée des erreurs d'un produit HGDC vers GlitchTip (protocole Sentry), sans SDK : une enveloppe postée par `fetch`, nettoyée, bornée, qui ne fait jamais échouer ni attendre l'appelant. Éteinte sans DSN : tests, base de dev et poste local restent muets.

```sh
bun add @hgdc/errors
```

| Import                 | Où                                       | Contenu                                                                                                                                                      |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@hgdc/errors`         | partout (pur, sans variable d'env.)      | `sendErrorReport`, `buildEnvelope`, `scrub`, `stackFrames`, `parseDsn`, `isReportable`, `createRateLimit`                                                    |
| `@hgdc/errors/convex`  | action ou action HTTP Convex             | `reportServerError(source, error, context?)` : lit `GLITCHTIP_DSN`, `CONVEX_CLOUD_URL`, `GLITCHTIP_RELEASE`                                                  |
| `@hgdc/errors/browser` | navigateur                               | `createBrowserReporter({ dsn })` → `{ report, install }` : chemin sans requête, une fois par erreur, dix par page                                            |
| `@hgdc/errors/server`  | serveur Bun ou Node (collecteur, worker) | `createErrorReporter({ dsn })` → `report(source, error, context?)` : envoi au tour suivant de la boucle, une remontée par source et par minute, 30 par heure |

## Exemples

```ts
// convex/github.ts (action)
import { reportServerError } from "@hgdc/errors/convex"

try {
  await syncRepository(ctx, args)
} catch (error) {
  await reportServerError("github", error, { step: "sync" })
  throw error
}
```

```ts
// src/lib/error-reporting.ts
import { createBrowserReporter } from "@hgdc/errors/browser"

export const errors = createBrowserReporter({ dsn: import.meta.env.VITE_GLITCHTIP_DSN, keyPrefixes: ["am_"] })
// __root.tsx : errors.install() ; une route en erreur : errors.report("route", error)
```

```ts
// collector/main.ts
import { createErrorReporter } from "@hgdc/errors/server"

const report = createErrorReporter({ dsn: process.env.GLITCHTIP_DSN, serverName: "collecteur" })
report("umami", error, { method: "POST", route: "/e", status: 502 })
```

## Ce qui part, ce qui ne part jamais

- Part : type et message (300 caractères), cadres de la pile sans sa première ligne, source en étiquette, contexte plat, environnement, nom de la machine, version (`release`).
- Masqué partout, contexte compris : adresses e-mail, IP v4 et v6, identifiants d'une URL (`postgres://moi:secret@…`), paramètres `token`, `code`, `key`, `secret`, `password`, `signature`…, en-têtes `Bearer` et `Basic`, clés à préfixe (`sk_live_…`), jetons de 32 caractères et plus. `keyPrefixes: ["am_"]` masque les clés courtes d'un produit.
- Ne part jamais : arguments, corps ou en-têtes de requête, requête de l'URL dans le navigateur. Une `ConvexError` (message écrit pour la personne) ne remonte pas.

Les erreurs d'une query ou d'une mutation Convex remontent par le navigateur, qui les reçoit : `fetch` n'y est pas permis.

Décision : [ADR 0008](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0008-errors-remontee-vers-glitchtip.md).

Tous droits réservés, Hugo Gebel Développement Conseil.
