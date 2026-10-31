// Versions exactes des paquets du kit dans `packages/config/stack.json`, tenues par la release.
//
//   bun scripts/stack-versions.ts pre   avant `changeset version` : si un paquet du kit va sortir,
//                                       @hgdc/config sort aussi (correctif), pour emporter le stack.json
//                                       à jour vers les produits (propagate.yml, `hgdc-stack sync`).
//   bun scripts/stack-versions.ts post  après `changeset version` : recopie dans stack.json la version
//                                       de chaque paquet publié du kit.
//
// Sans cela, un produit garderait l'ancienne version d'un paquet du kit, ou `hgdc-stack sync`
// la remettrait en arrière juste après `bun add`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

const root = new URL("../", import.meta.url)
const stackFile = new URL("packages/config/stack.json", root)
const changesetDir = new URL(".changeset/", root)
const CONFIG = "@hgdc/config"

type Manifest = { name: string; version: string; private?: boolean }

function kitPackages(): Manifest[] {
  return readdirSync(new URL("packages/", root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => JSON.parse(readFileSync(new URL(`packages/${entry.name}/package.json`, root), "utf8")) as Manifest)
    .filter((manifest) => !manifest.private && manifest.name.startsWith("@hgdc/"))
}

function pendingChangesets(): string[] {
  return readdirSync(changesetDir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => readFileSync(new URL(name, changesetDir), "utf8"))
}

function pre(): void {
  const pending = pendingChangesets()
  if (pending.length === 0 || pending.some((text) => text.includes(`"${CONFIG}"`))) return
  writeFileSync(
    new URL("stack-hgdc-versions.md", changesetDir),
    `---\n"${CONFIG}": patch\n---\n\nStack : versions exactes des paquets \`@hgdc/*\` de cette release.\n`,
  )
}

function post(): void {
  const stack = JSON.parse(readFileSync(stackFile, "utf8")) as Record<string, string>
  for (const { name, version } of kitPackages()) stack[name] = version
  const sorted = Object.fromEntries(Object.entries(stack).toSorted(([a], [b]) => a.localeCompare(b)))
  writeFileSync(stackFile, `${JSON.stringify(sorted, null, 2)}\n`)
}

const command = process.argv[2]
if (command === "pre") pre()
else if (command === "post") post()
else {
  console.error("Usage : bun scripts/stack-versions.ts <pre|post>")
  process.exit(2)
}
