---
owner: Hugo Gebel
last_reviewed: 2026-10-14
---

# Adopter le kit dans un produit

Exemple de référence : `agenthost` (HGDC Host).

## 1. Installer

```sh
bun add --dev --exact @hgdc/config oxlint oxlint-tsgolint oxfmt
bunx hgdc-stack sync && bun install
```

`hgdc-stack sync` épingle aux versions de la stack chaque paquet que le produit utilise déjà.

## 2. TypeScript

```jsonc
// tsconfig.json (application Vite + React)
{ "extends": "@hgdc/config/tsconfig/app.json", "include": ["src"], "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }

// convex/tsconfig.json
{ "extends": "@hgdc/config/tsconfig/convex.json", "include": ["./**/*"], "exclude": ["./_generated"] }
```

Presets : `base.json` (strict, `module: preserve`), `app.json` (DOM, JSX, `vite/client`), `convex.json` (options exigées par Convex), `library.json` (paquet publié, déclarations isolées).

## 3. Lint et format

```ts
// oxlint.config.ts
import hgdc from "@hgdc/config/oxlint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: ["**/_generated/**", "src/routeTree.gen.ts"],
})

// oxfmt.config.ts
import hgdc from "@hgdc/config/oxfmt"
import { defineConfig } from "oxfmt"

export default defineConfig({
  ...hgdc,
  sortTailwindcss: { stylesheet: "./src/styles.css", functions: ["cn", "cva"] },
})
```

Une exception propre au produit va dans `overrides` de sa config, avec la raison en commentaire. Une exception sur une ligne : `// oxlint-disable-next-line <règle> -- raison`.

Adopter oxfmt reformate tout le dépôt : le faire dans un commit à part, puis ajouter son SHA à `.git-blame-ignore-revs`.

## 4. Scripts et CI

```json
"check": "hgdc-stack check && bun run format:check && bun run typecheck && bun run lint && bun run test"
```

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  check:
    uses: hugogebel-boop/hgdc-kit/.github/workflows/check.yml@<sha> # main
```

Exiger le statut `check / check` dans la protection de `main` : sans lui, la fusion automatique passerait outre une CI rouge.

## 5. Renovate et propagation

```json
// renovate.json
{ "extends": ["github>hugogebel-boop/hgdc-kit//packages/config/renovate"] }
```

Puis ajouter le dépôt à la variable `HGDC_PRODUCTS` du kit (tableau JSON lu par `propagate.yml`) et au jeton `HGDC_BOT_TOKEN` (accès au dépôt, _Contents_ et _Pull requests_ en écriture), et activer « Allow auto-merge » dans les réglages du dépôt :

```sh
gh variable set HGDC_PRODUCTS --repo hugogebel-boop/hgdc-kit --body '["hugogebel-boop/agenthost"]'
```
