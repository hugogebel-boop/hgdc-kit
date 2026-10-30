# @hgdc/config

## 0.4.0

### Minor Changes

- 1866f4c: Stack : better-auth 1.6.33 (GHSA-qq9h-g4jm-xgf3, prise de compte par un mot de passe posé avant la connexion par lien magique ou code e-mail), zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, mémoire épuisée par un grand tableau). `@better-auth/oauth-provider` et `@better-auth/passkey` entrent dans la stack, à la même version que better-auth. `@hgdc/auth` demande better-auth 1.6.22 au moins ; `@hgdc/auth`, `@hgdc/api` et `@hgdc/assistant` demandent zod 4.6.7 au moins.

## 0.3.0

### Minor Changes

- e7db377: La stack épingle `@convex-dev/rate-limiter` à 0.4.2 (déjà la version de tous les produits sauf Mail, en 0.4.1, que `hgdc-stack sync` aligne à la prochaine propagation). Le preset Renovate laisse ce paquet au kit.

## 0.2.0

### Minor Changes

- e2b8dfa: `@anthropic-ai/sdk` 0.134.0 entre dans la stack (moteur de l'assistant commun, `@hgdc/assistant`) : épinglé par `hgdc-stack sync`, propagé par le kit, plus par Renovate.

## 0.1.4

### Patch Changes

- 55d82ce: `react-email` 6.11.1 rejoint la stack (`stack.json` et preset Renovate) : la version que le produit installe pour `@hgdc/ui/email` est celle contre laquelle le kit est testé.

## 0.1.3

### Patch Changes

- b94fdc2: oxlint : `expect(valeur, message)` accepté (`vitest/valid-expect` à deux arguments) et toute fonction `expect…` comptée comme assertion par `vitest/expect-expect`, en plus de `assert` et `assertType`.

## 0.1.2

### Patch Changes

- 7ac87eb: `hgdc-stack --help` (ou `-h`) affiche l'aide au lieu d'échouer sur une option inconnue.

## 0.1.1

### Patch Changes

- 492a6be: Liens vers la documentation et le signalement de faille sur la page npm de chaque paquet. Première version publiée par la CI, avec provenance.
