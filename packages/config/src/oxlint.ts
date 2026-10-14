import { defineConfig, type OxlintConfig } from "oxlint"

/**
 * Règles communes de la H family : la catégorie `correctness` d'oxlint (son défaut recommandé)
 * plus une courte liste de règles à forte valeur, toutes bloquantes. Pas d'avertissement :
 * une règle qui ne bloque pas finit ignorée.
 *
 * À étendre depuis l'`oxlint.config.ts` racine du produit, qui pose aussi `options.typeAware`
 * (oxlint ne lit cette option que dans la config racine).
 */
const hgdc: OxlintConfig = defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "promise", "react", "jsx-a11y", "vitest"],
  categories: {
    correctness: "error",
  },
  rules: {
    // Promesse oubliée = écriture Convex perdue ou erreur avalée.
    "typescript/no-floating-promises": "error",
    // Handler async passé en attribut JSX : usage React normal (recommandation typescript-eslint).
    "typescript/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
    "typescript/await-thenable": "error",
    "typescript/no-explicit-any": "error",
    "typescript/consistent-type-imports": "error",
    "eslint/eqeqeq": ["error", "smart"],
    "eslint/no-console": ["error", { allow: ["warn", "error"] }],
    "import/no-cycle": "error",
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    "react/jsx-key": "error",
    // Accessibilité alignée sur le preset `recommended` de eslint-plugin-jsx-a11y.
    "jsx-a11y/prefer-tag-over-role": "off",
    "jsx-a11y/control-has-associated-label": "off",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": [
      "error",
      {
        ul: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
        ol: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
        li: ["menuitem", "menuitemradio", "menuitemcheckbox", "option", "row", "tab", "treeitem"],
        table: ["grid"],
        td: ["gridcell"],
      },
    ],
    // Contrôles du kit UI reconnus comme champs ; texte du label souvent imbriqué dans des <span>.
    "jsx-a11y/label-has-associated-control": [
      "error",
      { controlComponents: ["Input", "Textarea", "Select", "Switch", "Checkbox", "RadioGroup"], depth: 3 },
    ],
    // Focus automatique voulu sur les écrans à une seule tâche (connexion, code à usage unique).
    "jsx-a11y/no-autofocus": "off",
    // Vitest accepte un message en second argument : `expect(valeur, "contexte")`.
    "vitest/valid-expect": ["error", { maxArgs: 2 }],
    // Défauts Vitest, plus les assertions partagées d'un fichier de test nommées `expect…` (`expectExited`).
    "vitest/expect-expect": ["error", { assertFunctionNames: ["expect*", "assert", "assertType"] }],
  },
  overrides: [
    {
      // Scripts et CLI : la console est leur interface. Convex : console.log alimente les logs du tableau de bord.
      files: ["scripts/**", "**/cli.ts", "**/*.config.ts", "convex/**"],
      rules: { "eslint/no-console": "off" },
    },
    {
      // Composant Label générique (shadcn) : le champ est associé là où il est utilisé.
      files: ["**/components/ui/label.tsx"],
      rules: { "jsx-a11y/label-has-associated-control": "off" },
    },
  ],
})

export default hgdc
