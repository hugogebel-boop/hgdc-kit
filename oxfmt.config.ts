import { defineConfig } from "oxfmt"
import hgdc from "./packages/config/src/oxfmt.ts"

export default defineConfig({
  ...hgdc,
  ignorePatterns: [
    ...(hgdc.ignorePatterns ?? []),
    "**/dist/**",
    // Chaque module, paquet interne et app a sa propre config, lancée depuis son dossier.
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
