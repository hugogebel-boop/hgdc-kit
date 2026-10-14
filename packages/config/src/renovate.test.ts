import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { loadStack } from "./stack.ts"

type Preset = { packageRules: { matchPackageNames?: string[]; enabled?: boolean }[] }

it("le preset Renovate des produits laisse toute la stack au kit", () => {
  const preset: Preset = JSON.parse(readFileSync(new URL("../renovate/default.json", import.meta.url), "utf8"))
  const disabled = preset.packageRules.find((rule) => rule.enabled === false)?.matchPackageNames ?? []
  expect(disabled.toSorted()).toEqual(["@hgdc/*", ...Object.keys(loadStack())].toSorted())
})
