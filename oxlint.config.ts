import { defineConfig } from "oxlint"
import hgdc from "./packages/config/src/oxlint.ts"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: ["**/dist/**"],
  overrides: [
    {
      // Paquet réservé, rempli par le chantier A de la vague 1 : retirer alors cette exception.
      files: ["packages/ui/src/index.ts"],
      rules: { "unicorn/no-empty-file": "off" },
    },
  ],
})
