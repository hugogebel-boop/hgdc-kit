import { readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"
import { alignManifest, findDrift, loadStack, parseManifest, parseStack, type Manifest } from "./stack.ts"

const stack = { react: "19.3.0", typescript: "7.0.2" }

describe("findDrift", () => {
  it("signale une plage ou une autre version, champ par champ", () => {
    const manifest: Manifest = {
      dependencies: { react: "^19.2.0", clsx: "^2.1.1" },
      devDependencies: { typescript: "7.0.1" },
    }
    expect(findDrift(manifest, stack)).toEqual([
      { name: "react", field: "dependencies", current: "^19.2.0", expected: "19.3.0" },
      { name: "typescript", field: "devDependencies", current: "7.0.1", expected: "7.0.2" },
    ])
  })

  it("ignore les paquets absents du manifeste et les peerDependencies", () => {
    const manifest: Manifest = { peerDependencies: { react: "^19" }, dependencies: { react: "19.3.0" } }
    expect(findDrift(manifest, stack)).toEqual([])
  })
})

describe("alignManifest", () => {
  it("épingle la stack, garde le reste et l'ordre des clés", () => {
    const manifest: Manifest = {
      name: "produit",
      dependencies: { clsx: "^2.1.1", react: "^19.2.0" },
      scripts: { check: "hgdc-stack check" },
    }
    const aligned = alignManifest(manifest, stack)
    expect(aligned).toEqual({
      name: "produit",
      dependencies: { clsx: "^2.1.1", react: "19.3.0" },
      scripts: { check: "hgdc-stack check" },
    })
    expect(Object.keys(aligned)).toEqual(["name", "dependencies", "scripts"])
    expect(findDrift(aligned, stack)).toEqual([])
  })

  it("ne modifie pas le manifeste d'origine", () => {
    const manifest: Manifest = { dependencies: { react: "^19.2.0" } }
    alignManifest(manifest, stack)
    expect(manifest.dependencies?.react).toBe("^19.2.0")
  })
})

describe("loadStack", () => {
  it("ne contient que des versions exactes", () => {
    const loaded = loadStack()
    expect(Object.keys(loaded).length).toBeGreaterThan(10)
    expect(loaded.typescript).toMatch(/^7\./)
  })

  it("fixe chaque paquet publié du kit à sa version (tenue par scripts/stack-versions.ts)", () => {
    const loaded = loadStack()
    const packages = readdirSync(new URL("../../", import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const text = readFileSync(new URL(`../../${entry.name}/package.json`, import.meta.url), "utf8")
        return JSON.parse(text) as { name: string; version: string; private?: boolean }
      })
      .filter((manifest) => !manifest.private)
    expect(packages.length).toBeGreaterThan(5)
    for (const { name, version } of packages) expect(loaded[name], name).toBe(version)
  })
})

describe("parseStack et parseManifest", () => {
  it("refusent une plage dans la stack", () => {
    expect(() => parseStack('{"react":"^19.3.0"}')).toThrow(/react@\^19.3.0/)
  })

  it("refusent un champ de dépendances qui n'est pas un objet de chaînes", () => {
    expect(() => parseManifest('{"dependencies":["react"]}')).toThrow(/package.json invalide/)
    expect(parseManifest('{"name":"x","dependencies":{"react":"19.3.0"}}').dependencies).toEqual({ react: "19.3.0" })
  })
})
