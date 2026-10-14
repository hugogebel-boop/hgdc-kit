import { defineConfig } from "oxlint"
import hgdc from "./packages/config/src/oxlint.ts"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: ["**/dist/**"],
  overrides: [
    {
      // Paquets réservés, remplis par les chantiers A et B de la vague 1 : retirer alors cette exception.
      files: ["packages/ui/src/index.ts", "packages/auth/src/index.ts"],
      rules: { "unicorn/no-empty-file": "off" },
    },
  ],
})
