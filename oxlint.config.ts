import { defineConfig } from "oxlint"
import hgdc from "./packages/config/src/oxlint.ts"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: [
    "**/dist/**",
    "packages/docs/example/**",
    "packages/docs/template/.astro/**",
    "packages/docs/template/.build/**",
    "packages/docs/.preview/**",
    "**/.hgdc-docs/**",
  ],
})
