import { defineConfig } from "oxfmt"
import hgdc from "./packages/config/src/oxfmt.ts"

export default defineConfig({
  ...hgdc,
  ignorePatterns: [
    ...(hgdc.ignorePatterns ?? []),
    "**/dist/**",
    "packages/docs/example/**",
    "packages/docs/template/.astro/**",
    "packages/docs/template/.build/**",
    "packages/docs/.preview/**",
    "**/.hgdc-docs/**",
  ],
})
