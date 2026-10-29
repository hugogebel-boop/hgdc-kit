import { z } from "zod"

/*
 * Outils MCP dérivés d'un `ToolSet` de `@hgdc/assistant/tools` : les outils de l'assistant d'un
 * produit et ceux de son serveur MCP sont les mêmes, avec les mêmes classes. Le type est
 * structurel (pas de dépendance au paquet de l'assistant) : un `ToolSet` s'y range tel quel.
 */

/** Classes de `@hgdc/assistant/tools` ; `send` (envoi vers l'extérieur) y arrive avec hgdc-kit#195. */
export type McpToolKind = "read" | "write" | "confirm" | "send"

/** Indications d'un outil (spécification MCP, `ToolAnnotations`). Le client les traite comme non fiables. */
export type ToolAnnotations = {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export type McpToolSpec = {
  kind: McpToolKind
  label: string
  description: string
  input: z.ZodObject
  /** Nom affiché ; `label` à défaut. */
  title?: string
  /** Surcharge des indications déduites de `kind`. */
  annotations?: ToolAnnotations
  /** Forme du résultat : `outputSchema` annoncé, `structuredContent` rendu et vérifié. */
  output?: z.ZodType
}

export type McpToolSet = Readonly<Record<string, McpToolSpec>>

/** Définition d'un outil dans `tools/list`. */
export type McpTool = {
  name: string
  title: string
  description: string
  inputSchema: { type: "object"; [key: string]: unknown }
  outputSchema?: { [key: string]: unknown }
  annotations: ToolAnnotations
}

/**
 * Indications déduites de la classe :
 * - `read` : lecture seule, rejouable ;
 * - `write` : modifie sans détruire ni envoyer ;
 * - `confirm` : envoie, publie, supprime ou ne se rattrape pas, donc destructif et ouvert sur
 *   l'extérieur. Le client doit demander confirmation : MCP n'a pas la carte « Confirmer » de
 *   l'assistant ;
 * - `send` : envoie vers l'extérieur (e-mail, webhook, message) sans rien effacer, donc ouvert
 *   sur l'extérieur, ni en lecture seule ni rejouable.
 * Les valeurs par défaut de la spécification (destructif, monde ouvert) sont toujours écrites.
 */
export function annotationsFor(kind: McpToolKind): Required<Omit<ToolAnnotations, "title">> {
  switch (kind) {
    case "read":
      return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    case "write":
      return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    case "confirm":
      return { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    case "send":
      return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }
}

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<
    string,
    unknown
  >
  return rest
}

/** Les définitions de `tools/list`, dans l'ordre de déclaration (stable, comme le veut la spécification). */
export function mcpTools(
  tools: McpToolSet,
  include: (name: string, tool: McpToolSpec) => boolean = () => true,
): McpTool[] {
  return Object.entries(tools)
    .filter(([name, tool]) => include(name, tool))
    .map(([name, tool]) => {
      const title = tool.title ?? tool.label
      return {
        name,
        title,
        description: tool.description,
        inputSchema: { ...jsonSchema(tool.input, "input"), type: "object" as const },
        ...(tool.output && { outputSchema: jsonSchema(tool.output, "output") }),
        annotations: { title, ...annotationsFor(tool.kind), ...tool.annotations },
      }
    })
}

/**
 * Erreur d'exécution d'un outil, montrée au modèle (`isError: true`) pour qu'il corrige son
 * appel : message court, en français, sans détail interne. Toute autre exception devient une
 * erreur interne générique.
 */
export class ToolError extends Error {
  override name = "ToolError"
}

export type ParsedCall = { ok: true; input: Record<string, unknown> } | { ok: false; message: string }

/** Vérifie les arguments d'un appel : champ inconnu refusé, message lisible par le modèle. */
export function parseArguments(tool: McpToolSpec, args: unknown): ParsedCall {
  const parsed = tool.input.strict().safeParse(args ?? {})
  if (parsed.success) return { ok: true, input: parsed.data as Record<string, unknown> }
  return { ok: false, message: `Paramètres invalides : ${z.prettifyError(parsed.error).slice(0, 600)}` }
}
