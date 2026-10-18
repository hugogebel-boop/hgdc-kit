import { z } from "zod"

/*
 * Les outils de l'assistant d'un produit. Chaque outil reprend une action de l'interface, avec
 * les droits de la personne qui parle, jamais plus. Le moteur impose la classe de chaque outil :
 * - `read` lit, sans effet : gestionnaire de lecture, dans une query ;
 * - `write` modifie sans rien envoyer ni détruire (brouillon, réglage réversible) ;
 * - `confirm` envoie, publie, supprime ou ne se rattrape pas : pendant le tour, il ne peut que
 *   décrire une carte (lecture seule) ; l'action n'a lieu qu'au clic « Confirmer », dans la
 *   mutation publique de la personne qui clique.
 * Aucune dépendance serveur : partagé par l'action Node (définitions envoyées au modèle) et les
 * fonctions Convex qui exécutent.
 */

export type ToolKind = "read" | "write" | "confirm"

export type ToolSpec = {
  kind: ToolKind
  /** Libellé de la pastille, en français : « Lecture des déploiements ». */
  label: string
  /** Ce que le modèle lit pour choisir l'outil. */
  description: string
  input: z.ZodObject
}

export type ToolSet = Readonly<Record<string, ToolSpec>>

/** Noms des outils d'une classe : `ToolNamesOf<typeof TOOLS, "confirm">`. */
export type ToolNamesOf<T extends ToolSet, K extends ToolKind> = {
  [N in keyof T]: T[N]["kind"] extends K ? N : never
}[keyof T] &
  string

/** L'entrée vérifiée d'un outil. */
export type ToolInputOf<T extends ToolSet, N extends keyof T> = z.infer<T[N]["input"]>

/** Définition au format de l'API Anthropic (`Anthropic.Tool`, sans les options de requête). */
export type ToolDefinition = {
  name: string
  description: string
  input_schema: { type: "object"; [key: string]: unknown }
}

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/

/** Vérifie les noms (`snake_case`, 64 caractères au plus) et rend l'ensemble tel quel, typé. */
export function defineTools<const T extends Record<string, ToolSpec>>(tools: T): T {
  for (const [name, tool] of Object.entries(tools)) {
    if (!TOOL_NAME.test(name)) throw new Error(`Nom d'outil invalide : ${name}`)
    if (!tool.label.trim() || !tool.description.trim()) throw new Error(`Outil ${name} : libellé ou description vide`)
  }
  return tools
}

/** Libellé d'une pastille ; le nom brut pour un outil inconnu. */
export function toolLabel(tools: ToolSet, name: string): string {
  return Object.hasOwn(tools, name) ? (tools[name]?.label ?? name) : name
}

/**
 * Définitions envoyées au modèle, dans l'ordre de déclaration : le préfixe outils + consigne est
 * mis en cache, il doit rester identique d'une requête à l'autre.
 */
export function toolDefinitions(tools: ToolSet): ToolDefinition[] {
  return Object.entries(tools).map(([name, tool]) => {
    const { $schema: _schema, ...schema } = z.toJSONSchema(tool.input) as Record<string, unknown>
    return { name, description: tool.description, input_schema: { ...schema, type: "object" as const } }
  })
}

export type ParsedToolCall =
  | { ok: true; name: string; kind: ToolKind; input: Record<string, unknown> }
  | { ok: false; message: string }

/**
 * L'appel du modèle, vérifié avant toute exécution : l'entrée arrive au fil de l'eau et un
 * analyseur tolérant peut rendre une entrée tronquée. Un champ inconnu est refusé.
 */
export function parseToolCall(tools: ToolSet, name: string, input: unknown): ParsedToolCall {
  if (!Object.hasOwn(tools, name)) return { ok: false, message: `Outil inconnu : ${name}` }
  const tool = tools[name]!
  const parsed = tool.input.strict().safeParse(input)
  if (!parsed.success)
    return { ok: false, message: `Paramètres invalides : ${z.prettifyError(parsed.error).slice(0, 600)}` }
  return { ok: true, name, kind: tool.kind, input: parsed.data as Record<string, unknown> }
}

/** Taille maximale, en caractères, d'un résultat d'outil rendu au modèle. */
export const MAX_TOOL_RESULT = 20_000

/** Le résultat d'un outil pour le modèle : JSON, toujours coupé au-delà de `max` caractères. */
export function toolResult(value: unknown, max: number = MAX_TOOL_RESULT): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "null")
  const limit = Math.min(Math.max(0, max), MAX_TOOL_RESULT)
  return text.length > limit ? `${text.slice(0, limit)}… (tronqué)` : text
}

/** Ce que rend un outil `confirm` au modèle : la carte est affichée, rien n'est parti. */
export function awaitingConfirmation(actionId: string, summary: string): string {
  return toolResult({
    status: "awaiting_confirmation",
    actionId,
    summary,
    message:
      "Une carte de confirmation est affichée. Rien ne se fait avant le clic de la personne. Ne rappelle pas cet outil pour la même action.",
  })
}

/** JSON aux clés triées : la même valeur donne toujours le même texte. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  )
}

/**
 * Empreinte SHA-256 (hexadécimal) d'une valeur, par Web Crypto (Convex V8 et Node) : ce que la
 * carte montre, comparé au clic. Un contenu qui a bougé entre-temps refuse l'action.
 */
export async function snapshotHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
