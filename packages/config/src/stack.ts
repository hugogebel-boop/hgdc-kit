import { readFileSync } from "node:fs"

/** Versions exactes de la stack commune, par nom de paquet. */
export type Stack = Readonly<Record<string, string>>

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const
type DependencyField = (typeof DEPENDENCY_FIELDS)[number]

/** Sous-ensemble d'un package.json utile ici ; les autres champs sont conservés tels quels. */
export type Manifest = { [K in DependencyField]?: Record<string, string> } & Record<string, unknown>

export type Drift = {
  name: string
  field: DependencyField
  current: string
  expected: string
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  )
}

function isManifest(value: unknown): value is Manifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const fields: Record<string, unknown> = { ...value }
  return DEPENDENCY_FIELDS.every((field) => fields[field] === undefined || isStringRecord(fields[field]))
}

export function parseStack(text: string): Stack {
  const raw: unknown = JSON.parse(text)
  if (!isStringRecord(raw)) throw new Error("stack.json doit associer un nom de paquet à une version")
  const inexact = Object.entries(raw).filter(([, version]) => !EXACT_VERSION.test(version))
  if (inexact.length > 0) {
    throw new Error(`stack.json : versions non exactes : ${inexact.map(([n, v]) => `${n}@${v}`).join(", ")}`)
  }
  return raw
}

export function parseManifest(text: string): Manifest {
  const raw: unknown = JSON.parse(text)
  if (!isManifest(raw)) throw new Error("package.json invalide : un champ de dépendances n'est pas un objet de chaînes")
  return raw
}

export function loadStack(): Stack {
  return parseStack(readFileSync(new URL("../stack.json", import.meta.url), "utf8"))
}

/**
 * Écarts entre un manifeste et la stack. Un paquet absent du manifeste n'est pas un écart :
 * la stack fixe la version de ce qu'un produit utilise, pas la liste de ses dépendances.
 * `peerDependencies` est ignoré : une plage y est voulue. Une dépendance `workspace:` aussi :
 * c'est un paquet du même dépôt, l'épingler casse le lockfile (paquet en double).
 */
export function findDrift(manifest: Manifest, stack: Stack): Drift[] {
  const drift: Drift[] = []
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, current] of Object.entries(manifest[field] ?? {})) {
      if (isWorkspace(current)) continue
      const expected = stack[name]
      if (expected !== undefined && current !== expected) drift.push({ name, field, current, expected })
    }
  }
  return drift
}

/** Copie du manifeste où chaque paquet de la stack est épinglé à sa version. */
export function alignManifest(manifest: Manifest, stack: Stack): Manifest {
  const aligned: Manifest = { ...manifest }
  for (const field of DEPENDENCY_FIELDS) {
    const deps = manifest[field]
    if (!deps) continue
    aligned[field] = Object.fromEntries(
      Object.entries(deps).map(([name, version]) => [name, isWorkspace(version) ? version : (stack[name] ?? version)]),
    )
  }
  return aligned
}

function isWorkspace(specifier: string): boolean {
  return specifier.startsWith("workspace:")
}
