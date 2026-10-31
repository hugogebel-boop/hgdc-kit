#!/usr/bin/env node
// @ts-check
// CLI de HGDC Docs : construit la doc du dossier courant (docs.json + pages MDX) avec le
// modèle Starlight du paquet. En JavaScript : Node ne retire pas les types d'un fichier
// situé dans node_modules, et ce fichier y vit chez le client.
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const USAGE = `Utilisation : hgdc-docs <dev|build|preview> [dossier] [--port 4321] [--host 0.0.0.0]
          hgdc-docs openapi <spec.json> <dossier> [--titles '{"Emails":"E-mails"}']

  dev       site local, rechargé à chaque modification
  build     site statique dans <dossier>/dist (llms.txt et corpus de l'assistant compris)
  preview   sert le dernier build

  openapi   écrit une page MDX par groupe d'une spécification OpenAPI 3 (une page par tag)

Variables : HGDC_DOCS_SITE (adresse publique), HGDC_DOCS_API (API de l'assistant), HGDC_DOCS_OUT.`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string" },
    host: { type: "string" },
    titles: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
})
const [command = "build", dir = "."] = positionals
if (command === "openapi") {
  const [, spec, out] = positionals
  if (!spec || !out) {
    process.stderr.write(`${USAGE}
`)
    process.exit(1)
  }
  const { openApiPages } = await import("../dist/openapi.js")
  const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs")
  const titles = values.titles ? JSON.parse(values.titles) : {}
  mkdirSync(resolve(out), { recursive: true })
  for (const page of openApiPages(JSON.parse(readFileSync(resolve(spec), "utf8")), { titles })) {
    writeFileSync(resolve(out, `${page.slug}.mdx`), page.mdx)
    process.stdout.write(`${out}/${page.slug}.mdx
`)
  }
  process.exit(0)
}
if (values.help || !["dev", "build", "preview"].includes(command)) {
  process.stdout.write(`${USAGE}
`)
  process.exit(values.help ? 0 : 1)
}

process.env.HGDC_DOCS_DIR = resolve(dir)
if (!process.env.HGDC_DOCS_OUT) process.env.HGDC_DOCS_OUT = resolve(dir, "dist")
// Un aperçu de la console (HGDC_DOCS_ROOT) a son propre dossier de travail d'Astro.
const root = process.env.HGDC_DOCS_ROOT
  ? resolve(process.env.HGDC_DOCS_ROOT)
  : fileURLToPath(new URL("../template/", import.meta.url))
const port = values.port ? Number(values.port) : undefined
const server = { ...(port ? { port } : {}), ...(values.host ? { host: values.host } : {}) }
const inline = { root, server }

// Astro écrit son cache dans le dossier courant : celui du modèle, pas le dépôt du client.
process.chdir(root)
const astro = await import("astro")
try {
  if (command === "build") await astro.build(inline)
  else if (command === "dev") await astro.dev(inline)
  else await astro.preview(inline)
} catch (error) {
  // Une erreur de docs.json se lit sans pile d'appels : elle dit déjà quoi corriger.
  const message = error instanceof Error ? error.message : String(error)
  console.error(message.includes("docs.json") ? `\n${message}\n` : error)
  process.exit(1)
}
