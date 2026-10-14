#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { alignManifest, findDrift, loadStack, parseManifest } from "./stack.ts"

const USAGE = `Usage : hgdc-stack <check|sync> [--cwd <dossier>]

  check  échoue si une dépendance de la stack n'est pas à sa version exacte
  sync   réécrit package.json aux versions de la stack (lancer bun install ensuite)`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { cwd: { type: "string", default: process.cwd() } },
})
const command = positionals[0]
if (command !== "check" && command !== "sync") {
  console.error(USAGE)
  process.exit(2)
}

const manifestPath = resolve(values.cwd, "package.json")
const manifest = parseManifest(readFileSync(manifestPath, "utf8"))
const stack = loadStack()
const drift = findDrift(manifest, stack)

if (drift.length === 0) {
  console.log("Stack HGDC : à jour.")
  process.exit(0)
}

for (const { name, field, current, expected } of drift) {
  console.log(`  ${name} (${field}) : ${current} → ${expected}`)
}

if (command === "check") {
  console.error(`\nStack HGDC : ${drift.length} écart(s). Corriger avec « hgdc-stack sync » puis « bun install ».`)
  process.exit(1)
}

writeFileSync(manifestPath, `${JSON.stringify(alignManifest(manifest, stack), null, 2)}\n`)
console.log(`\nStack HGDC : ${drift.length} version(s) réalignée(s). Lancer « bun install ».`)
