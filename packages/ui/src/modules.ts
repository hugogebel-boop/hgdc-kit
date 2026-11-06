import type { FamilyProduct } from "./family-svg.ts"

/**
 * Les modules de Basalte, un produit unique (organisation, projets, modules). Le mot technique
 * (`host`) reste dans les adresses, les clés et le code ; l'interface n'affiche que le nom du module.
 * Logique pure : la barre (`module-bar.tsx`) et son stockage (`module-bar-store.ts`) s'y appuient.
 */
export type ModuleWord = Extract<FamilyProduct, "host" | "mail" | "status" | "analytics" | "id" | "docs" | "iassistant">

export type BasalteModule = {
  word: ModuleWord
  /** Nom affiché : « Déploiements ». */
  name: string
  /** Ce que le module apporte, en quelques mots : montré à côté d'un module masqué. */
  purpose: string
}

/** Tous les modules, dans leur ordre par défaut. */
export const BASALTE_MODULES: ReadonlyArray<BasalteModule> = [
  { word: "host", name: "Déploiements", purpose: "Mettre un site en ligne" },
  { word: "mail", name: "E-mails", purpose: "Envoyer des e-mails" },
  { word: "status", name: "Surveillance", purpose: "Surveiller un site" },
  { word: "analytics", name: "Statistiques", purpose: "Compter les visites" },
  { word: "id", name: "Connexion", purpose: "Connecter tes utilisateurs" },
  { word: "docs", name: "Documentation", purpose: "Publier une documentation" },
  { word: "iassistant", name: "Assistant IA", purpose: "Répondre aux visiteurs" },
]

/** Les modules montrés tant que la personne n'a rien choisi. */
export const DEFAULT_MODULE_BAR: ReadonlyArray<ModuleWord> = ["host", "mail", "status", "analytics"]

export function isModuleWord(value: unknown): value is ModuleWord {
  return BASALTE_MODULES.some((item) => item.word === value)
}

export function moduleByWord(word: ModuleWord): BasalteModule {
  const found = BASALTE_MODULES.find((item) => item.word === word)
  if (!found) throw new Error(`@hgdc/ui/modules : module inconnu « ${word} »`)
  return found
}

/** Ordre retenu (stockage, réseau) : les mots connus, sans doublon. `null` si ce n'est pas une liste. */
export function parseModuleBar(value: unknown): Array<ModuleWord> | null {
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter(isModuleWord))]
}

/**
 * La liste à montrer : l'ordre de la personne, plus le module ouvert s'il n'y est pas (on ne perd
 * jamais de vue où l'on est).
 */
export function shownModules(order: ReadonlyArray<ModuleWord>, current?: string): Array<ModuleWord> {
  return isModuleWord(current) && !order.includes(current) ? [...order, current] : [...order]
}

/** Les modules absents de la liste, dans l'ordre par défaut. */
export function hiddenModules(shown: ReadonlyArray<ModuleWord>): Array<BasalteModule> {
  return BASALTE_MODULES.filter((item) => !shown.includes(item.word))
}

/** Déplace l'entrée `from` à la place `to` ; hors limites, la liste reste telle quelle. */
export function moveModule<T>(list: ReadonlyArray<T>, from: number, to: number): Array<T> {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}
