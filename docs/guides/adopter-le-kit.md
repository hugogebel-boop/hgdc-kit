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

oxfmt exige des fins de ligne LF. Sous Windows (`core.autocrlf=true`), git rend les fichiers en CRLF et `format:check` échoue sur tout le dépôt : poser un `.gitattributes` avant le formatage.

```gitattributes
* text=auto eol=lf
*.png binary
*.ico binary
*.woff2 binary
```

Côté tests, le preset accepte `expect(valeur, "message")` et compte comme assertion toute fonction `expect…` (une aide partagée comme `expectExited`), en plus de `assert` et `assertType`.

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

## 6. Connexion HGDC (`@hgdc/auth`)

Pour un produit qui se connecte par HGDC Account : `bun add @hgdc/auth`, puis suivre le [README du paquet](../../packages/auth/README.md) (fournisseur `hgdc` dans `genericOAuth`, proxy `/api/auth` avec `restoreFetchMode` côté Convex, bouton, gardes avec l'émetteur `CONVEX_SITE_URL`). Le `clientId` et le `clientSecret` sont remis par HGDC à l'enregistrement du produit.

## 7. Interface

```sh
bun add @hgdc/ui
```

```css
/* src/styles.css : Tailwind, puis le kit, puis ce qui est propre au produit */
@import "tailwindcss";
@import "@hgdc/ui/styles.css";

@custom-variant rail (&:where([data-sidebar="rail"] *));

:root {
  --chart-1: oklch(0.55 0.25 296); /* un écart au jeton du kit */
}
```

Le kit apporte les polices (Inter, Geist), `shadcn/tailwind.css`, les jetons clair et sombre et les utilitaires communs (`surface`, `surface-link`, `pressable`, `touch-target`, `soft-in`, `rise`…). Le produit ne garde que ses ajouts : variantes, teintes, animations qui lui sont propres. Ne pas redéclarer un `@utility` du kit.

Le thème : `ThemeProvider` autour de l'application, et `themeInitScript` dans un `<script>` du `<head>`, avant la feuille de styles, pour éviter le flash au chargement.

### Migrer depuis des copies locales

Les primitives de Host et Mail sont celles du kit. Pour basculer :

```sh
grep -rlE '@/components/ui/|@/components/(spinner|theme-provider)|@/lib/hooks/use-media-query|@/lib/utils"' src \
  | xargs sed -i -E 's#"@/components/ui/([a-z-]+)"#"@hgdc/ui/\1"#g; s#"@/components/spinner"#"@hgdc/ui/spinner"#g;
      s#"@/components/theme-provider"#"@hgdc/ui/theme"#g; s#"@/lib/hooks/use-media-query"#"@hgdc/ui/use-media-query"#g;
      s#"@/lib/utils"#"@hgdc/ui/cn"#g'
```

Puis retirer `src/components/ui/`, `spinner.tsx`, `theme-provider.tsx`, `use-media-query.ts`, `lib/utils.ts`, réduire `styles.css` à ses ajouts, et lancer `check` et `build`.

Écarts à connaître : `SegmentedControl` est teinté (`bg-muted`), sans contour ; une grille sans colonnes déclarées ne déborde plus sur téléphone (`.grid` en `minmax(0, 1fr)`) ; un `Button` rendu en lien n'a plus `role="button"`.
