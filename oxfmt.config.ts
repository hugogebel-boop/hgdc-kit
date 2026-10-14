import { defineConfig } from "oxfmt"
import hgdc from "./packages/config/src/oxfmt.ts"

export default defineConfig({
  ...hgdc,
  ignorePatterns: [...(hgdc.ignorePatterns ?? []), "**/dist/**"],
})
