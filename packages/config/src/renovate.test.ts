import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { loadStack } from "./stack.ts"

type Preset = { packageRules: { matchPackageNames?: string[]; enabled?: boolean }[] }

it("le preset Renovate des produits laisse toute la stack au kit", () => {
  const preset: Preset = JSON.parse(readFileSync(new URL("../renovate/default.json", import.meta.url), "utf8"))
  const disabled = preset.packageRules.find((rule) => rule.enabled === false)?.matchPackageNames ?? []
  // Les paquets du kit sont couverts par `@hgdc/*`.
  const stack = Object.keys(loadStack()).filter((name) => !name.startsWith("@hgdc/"))
  expect(disabled.toSorted()).toEqual(["@hgdc/*", ...stack].toSorted())
})
