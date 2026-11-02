/**
 * Non-régression de la démo (ADR 0017) : chaque mutation et action publique d'un produit passe par
 * une garde qui refuse l'organisation de démo, ou figure dans une liste blanche commentée. Les
 * fonctions sont énumérées depuis les modules réellement chargés, jamais depuis une liste écrite à la
 * main : une fonction ajoutée demain sans garde fait échouer le test du produit.
 *
 * Indépendant du lanceur de tests : le produit compare le résultat à `[]` dans son propre test.
 */

/** Mutation ou action publique trouvée dans un module de `convex/`. */
export type PublicWrite = {
  /** Nom Convex, `module:export` (`forms/consent:confirmConsent`). */
  name: string
  /** Chemin du module tel que donné (`./forms/consent.ts`). */
  path: string
  exportName: string
  /** Code du gestionnaire (`String(fn._handler)`), vide si absent. */
  handler: string
}

/**
 * Modules de `convex/`, clés en `./chemin.ts` : chargeurs paresseux (`import.meta.glob`, le `modules`
 * de convex-test) ou modules déjà chargés (`{ eager: true }`).
 */
export type ConvexModules = Record<string, unknown>

export type DemoGuardAudit = {
  /** Toutes les mutations et actions publiques trouvées, triées par nom. */
  writes: PublicWrite[]
  /** Fonctions ni gardées, ni dans la liste blanche (avec une raison non vide). */
  unguarded: string[]
  /** Entrées de la liste blanche qui ne nomment plus aucune fonction publique. */
  staleAllowed: string[]
}

export type DemoGuardOptions = {
  modules: ConvexModules
  /**
   * Noms des gardes qui refusent la démo (`refuseDemo`, gardes du produit, fonctions internes
   * `internal.x.y` qu'une action appelle avant toute écriture).
   */
  guards: readonly string[]
  /** Exceptions, nom → raison pour laquelle la démo ne peut pas y écrire. Une raison vide n'excuse rien. */
  allowed: Readonly<Record<string, string>>
  /**
   * Lecture propre au produit (source du module, découverte transitive…). Par défaut : le gestionnaire
   * appelle une garde (`guardCallPattern(guards)`).
   */
  isGuarded?: (write: PublicWrite, guardCall: RegExp) => boolean
}

const SKIPPED = /(?:\.test|\.d|convex\.config)\.tsx?$/

/**
 * Un appel (`garde(`, `(0, garde)(`) ou une référence passée à `ctx.run*` (`internal.x.y,`). Un point
 * dans un nom est littéral.
 */
export function guardCallPattern(guards: readonly string[]): RegExp {
  if (guards.length === 0) throw new Error("guardCallPattern : aucune garde nommée")
  const names = guards.map((guard) => guard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(String.raw`\b(?:${names.join("|")})\b\)?\s*[(,]`)
}

type Registered = { isPublic?: unknown; isMutation?: unknown; isAction?: unknown; _handler?: unknown }

/** Mutations et actions publiques des modules, hors `_generated`, tests, déclarations et `convex.config`. */
export async function listPublicWrites(modules: ConvexModules): Promise<PublicWrite[]> {
  const found: PublicWrite[] = []
  for (const [path, entry] of Object.entries(modules)) {
    if (SKIPPED.test(path) || path.includes("/_generated/")) continue
    const loaded: unknown = typeof entry === "function" ? await (entry as () => Promise<unknown>)() : entry
    if (typeof loaded !== "object" || loaded === null) continue
    const module = path.replace(/^\.\//, "").replace(/\.tsx?$/, "")
    for (const [exportName, value] of Object.entries(loaded)) {
      if (typeof value !== "function" && (typeof value !== "object" || value === null)) continue
      const fn = value as Registered
      if (fn.isPublic !== true || !(fn.isMutation === true || fn.isAction === true)) continue
      const handler = typeof fn._handler === "function" ? fn._handler.toString() : ""
      found.push({ name: `${module}:${exportName}`, path, exportName, handler })
    }
  }
  return found.toSorted((a, b) => a.name.localeCompare(b.name))
}

/** Les deux vérifications : fonctions sans garde, et exceptions qui nomment une fonction disparue. */
export async function auditDemoGuards(options: DemoGuardOptions): Promise<DemoGuardAudit> {
  const writes = await listPublicWrites(options.modules)
  const guardCall = guardCallPattern(options.guards)
  const isGuarded = options.isGuarded ?? ((write, pattern) => pattern.test(write.handler))
  const excused = (name: string) => Object.hasOwn(options.allowed, name) && options.allowed[name]!.trim() !== ""
  const unguarded = writes.filter((w) => !excused(w.name) && !isGuarded(w, guardCall)).map((w) => w.name)
  const names = new Set(writes.map((w) => w.name))
  const staleAllowed = Object.keys(options.allowed).filter((name) => !names.has(name))
  return { writes, unguarded, staleAllowed }
}
