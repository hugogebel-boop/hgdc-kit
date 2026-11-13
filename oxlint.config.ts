import { defineConfig } from "oxlint"
import hgdc from "./packages/config/src/oxlint.ts"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: [
    "**/dist/**",
    // Chaque module et chaque app a sa propre config, lancée depuis son dossier (oxlint de la racine :
    // --disable-nested-config, sinon il lit celle des modules et refuse leur typeAware).
    "modules/**",
    "internal/**",
    "apps/**",
    "packages/docs/example/**",
    "packages/docs/template/.astro/**",
    "packages/docs/template/.build/**",
    "packages/docs/.preview/**",
    "**/.hgdc-docs/**",
  ],
})
