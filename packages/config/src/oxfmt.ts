import { defineConfig, type OxfmtConfig } from "oxfmt"

/**
 * Format commun de la H family, aligné sur le code existant de host et mail
 * (sans point-virgule, guillemets doubles). Le produit étend ce preset et ajoute,
 * s'il utilise Tailwind, `sortTailwindcss.stylesheet` vers sa feuille principale.
 */
const hgdc: OxfmtConfig = defineConfig({
  printWidth: 120,
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  sortPackageJson: false,
  ignorePatterns: ["**/_generated/**", "**/routeTree.gen.ts", "**/CHANGELOG.md", ".changeset/*.md"],
})

export default hgdc
