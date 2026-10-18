#!/usr/bin/env node
// hgdc-brand : pose les icônes du kit dans un produit ou un site (src/brand.ts).
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { appIconCopies, emailIconCopies, runCopies } from "./brand.ts"

const USAGE = `Usage : hgdc-brand <commande>

  sync <mot> [--public <dossier>] [--email-as <fichier>]...
      pose favicon et icônes d'application du produit dans public/ (défaut : ./public) ;
      --email-as copie aussi son icône d'e-mail sous ce nom (adresse déjà envoyée)
  emails <dossier>
      pose les icônes d'e-mail de tous les produits (<mot>.png) dans le dossier

Les fichiers posés ne se versionnent pas : les lister dans le .gitignore.`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    public: { type: "string", default: "public" },
    "email-as": { type: "string", multiple: true, default: [] },
    help: { type: "boolean", short: "h", default: false },
  },
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

const [command, target] = positionals
try {
  if (command === "sync" && target) {
    const copies = appIconCopies(target, resolve(values.public), values["email-as"])
    await runCopies(copies)
    console.log(`hgdc-brand : ${copies.length} icônes de ${target} posées dans ${values.public}/`)
  } else if (command === "emails" && target) {
    const copies = emailIconCopies(resolve(target))
    await runCopies(copies)
    console.log(`hgdc-brand : ${copies.length} icônes d'e-mail posées dans ${target}/`)
  } else {
    console.error(USAGE)
    process.exit(2)
  }
} catch (error) {
  console.error(`hgdc-brand : ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
