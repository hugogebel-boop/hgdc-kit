// Publie sur npm chaque paquet dont la version n'y est pas encore, puis crée les tags git.
// Lancé par release.yml (provenance signée) ou, pour le premier publish d'un paquet, en local après
// `npm login` (docs/runbooks/publier.md). `bun pm pack` remplace le protocole workspace: ;
// `npm publish` porte l'OIDC du trusted publishing, que `bun publish` ne gère pas encore
// (oven-sh/bun#22423).
import { rm } from "node:fs/promises"
import { $, Glob } from "bun"

type PackageJson = { name: string; version: string; private?: boolean }

// La provenance n'existe qu'en CI : elle atteste le workflow qui a construit le paquet.
const provenance = process.env.CI ? ["--provenance"] : []

await rm(".pack", { recursive: true, force: true })

for await (const manifestPath of new Glob("packages/*/package.json").scan()) {
  const pkg: PackageJson = await Bun.file(manifestPath).json()
  if (pkg.private) continue

  const id = `${pkg.name}@${pkg.version}`
  const published = await $`npm view ${id} version`.quiet().nothrow()
  if (published.exitCode === 0 && published.text().trim() === pkg.version) {
    console.log(`${id} : déjà publié`)
    continue
  }

  await $`bun pm pack --quiet --destination ../../.pack`.cwd(manifestPath.replace(/[\\/]package\.json$/, ""))
  const tarball = `.pack/${pkg.name.slice(1).replace("/", "-")}-${pkg.version}.tgz`
  const packed = await $`tar -xOzf ${tarball} package/package.json`.text()
  if (packed.includes("workspace:")) throw new Error(`${id} : le protocole workspace: est resté dans le paquet`)

  await $`npm publish ${tarball} --access public ${provenance}`
}

await $`changeset tag`
