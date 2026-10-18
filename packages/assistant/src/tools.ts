import { z } from "zod"

/*
 * Les outils de l'assistant d'un produit. Chaque outil reprend une action de l'interface, avec
 * les droits de la personne qui parle, jamais plus :
 * - `read` lit, sans effet ;
 * - `write` modifie sans rien envoyer ni détruire (brouillon, réglage réversible) ;
 * - `confirm` envoie, publie, supprime ou ne se rattrape pas : il devient une carte, et n'a lieu
 *   qu'au clic « Confirmer » de la personne, dans une mutation publique avec sa session.
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

export function isToolName<T extends ToolSet>(tools: T, name: string): name is Extract<keyof T, string> {
  return Object.hasOwn(tools, name)
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

/** Le résultat d'un outil pour le modèle : JSON, coupé au-delà de `max` caractères. */
export function toolResult(value: unknown, max = 20_000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return text.length > max ? `${text.slice(0, max)}… (tronqué)` : text
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

/**
 * Empreinte courte d'un texte (cyrb53) : assez pour voir qu'un contenu a bougé entre la carte et
 * le clic. Pas un hachage cryptographique : rien de secret n'en dépend.
 */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
