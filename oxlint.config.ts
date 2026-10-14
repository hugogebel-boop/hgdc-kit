import { defineConfig } from "oxlint"
import hgdc from "./packages/config/src/oxlint.ts"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: ["**/dist/**"],
})
