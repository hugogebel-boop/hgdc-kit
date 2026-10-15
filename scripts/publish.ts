// Publie sur npm chaque paquet dont la version n'y est pas encore, puis crée les tags git.
// Lancé par release.yml (provenance signée) ou, pour le premier publish d'un paquet, en local après
// `npm login` (docs/runbooks/publier.md). `bun pm pack` remplace le protocole workspace: ;
// `npm publish` porte l'OIDC du trusted publishing, que `bun publish` ne gère pas encore
// (oven-sh/bun#22423).
//
// En CI, un paquet absent de npm est sauté : npm ne déclare un trusted publisher que sur un paquet
// qui existe, l'OIDC échouerait et bloquerait les autres. Son premier envoi se fait en local.
import { appendFile, rm } from "node:fs/promises"
import { $, Glob } from "bun"

type PackageJson = { name: string; version: string; private?: boolean }

const ci = Boolean(process.env.CI)
// La provenance n'existe qu'en CI : elle atteste le workflow qui a construit le paquet.
const provenance = ci ? ["--provenance"] : []

/** Versions publiées sur npm, `null` si le paquet n'y a jamais été publié. */
async function publishedVersions(name: string): Promise<string[] | null> {
  const result = await $`npm view ${name} versions --json`.quiet().nothrow()
  if (result.exitCode === 0) {
    const versions: unknown = JSON.parse(result.text() || "[]")
    return Array.isArray(versions) ? versions.map(String) : [String(versions)]
  }
  if (result.stderr.toString().includes("E404")) return null
  throw new Error(`${name} : npm view a échoué\n${result.stderr.toString()}`)
}

await rm(".pack", { recursive: true, force: true })

const tags: { name: string; tag: string }[] = []

for await (const manifestPath of new Glob("packages/*/package.json").scan()) {
  const pkg: PackageJson = await Bun.file(manifestPath).json()
  if (pkg.private) continue

  const id = `${pkg.name}@${pkg.version}`
  const versions = await publishedVersions(pkg.name)
  if (versions?.includes(pkg.version)) {
    console.log(`${id} : déjà publié`)
    continue
  }
  if (versions === null && ci) {
    console.log(
      `::warning title=Premier envoi manuel::${id} n'existe pas encore sur npm : publier depuis le poste (docs/runbooks/publier.md).`,
    )
    continue
  }

  await $`bun pm pack --quiet --destination ../../.pack`.cwd(manifestPath.replace(/[\\/]package\.json$/, ""))
  const tarball = `.pack/${pkg.name.slice(1).replace("/", "-")}-${pkg.version}.tgz`
  const packed = await $`tar -xOzf ${tarball} package/package.json`.text()
  if (packed.includes("workspace:")) throw new Error(`${id} : le protocole workspace: est resté dans le paquet`)

  await $`npm publish ${tarball} --access public ${provenance}`
  tags.push({ name: pkg.name, tag: id })
}

// Un tag par paquet publié ici, et seulement eux : `changeset tag` étiquetterait aussi un paquet
// sauté. Comme lui, une ligne `git-tag` par tag dans le fichier `CHANGESETS_OUTPUT` : changesets/action
// la lit pour pousser le tag et créer la release GitHub. En local, `git push --tags` (runbook).
const output = process.env.CHANGESETS_OUTPUT
for (const { name, tag } of tags) {
  const exists = await $`git rev-parse -q --verify refs/tags/${tag}`.quiet().nothrow()
  if (exists.exitCode !== 0) await $`git tag -a ${tag} -m ${tag}`
  if (output) await appendFile(output, `${JSON.stringify({ type: "git-tag", tag, packageName: name })}\n`)
  console.log(`New tag: ${tag}`)
}
