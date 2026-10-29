import { defineTable, type DataModelFromSchemaDefinition, type SchemaDefinition } from "convex/server"
import { v, type GenericId, type Infer } from "convex/values"

/*
 * Les tables de l'assistant et leurs validateurs. L'organisation est celle d'Account (identifiant
 * texte), la personne son `subject`.
 */

export const vToolChip = v.object({
  id: v.string(),
  label: v.string(),
  status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
})
export type ToolChip = Infer<typeof vToolChip>

export const vMessageStatus = v.union(
  v.literal("pending"),
  v.literal("streaming"),
  v.literal("done"),
  v.literal("error"),
)

export const vActionStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("cancelled"),
  v.literal("failed"),
)

export const vActionDetail = v.object({ label: v.string(), value: v.string() })
export type ActionDetail = Infer<typeof vActionDetail>

/** Les cinq tables, à étaler dans `defineSchema({ ...assistantTables(), … })`. */
export function assistantTables() {
  return {
    /** Une conversation, propre à une personne dans une organisation. `history` : messages de l'API Anthropic en JSON. */
    assistantThreads: defineTable({
      organizationId: v.string(),
      userId: v.string(),
      title: v.string(),
      /** Profil de la conversation (« team », « client »…) : consigne et outils ne changent jamais en route. */
      mode: v.optional(v.string()),
      history: v.string(),
      /** L'historique a atteint sa taille maximale : une nouvelle conversation s'impose. */
      full: v.optional(v.boolean()),
      /** Événements de l'application (confirmations, annulations) à remettre au modèle au tour suivant. */
      notes: v.optional(v.array(v.string())),
      /** Numéro du premier événement de `notes` (les plus anciens tombent au-delà de 20). */
      notesBase: v.optional(v.number()),
      updatedAt: v.number(),
    })
      .index("by_org_user", ["organizationId", "userId", "updatedAt"])
      .index("by_user", ["userId"])
      .index("by_updated", ["updatedAt"]),

    /** Un message affiché : la demande, ou la réponse écrite au fil de l'eau. */
    assistantMessages: defineTable({
      threadId: v.id("assistantThreads"),
      organizationId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant")),
      text: v.string(),
      status: vMessageStatus,
      tools: v.array(vToolChip),
      /** Crédits affichés (dérivés de `costMicros`). */
      credits: v.optional(v.number()),
      /** Réservation posée au début du tour (clé de la plateforme), et son mois. */
      reservedMicros: v.optional(v.number()),
      month: v.optional(v.string()),
      costMicros: v.optional(v.number()),
      /** Le tour est soldé : réservation levée, coût débité. */
      settled: v.optional(v.boolean()),
    })
      .index("by_thread", ["threadId"])
      .index("by_status", ["status"]),

    /** Une action proposée par l'assistant, qui n'a lieu qu'au clic « Confirmer ». */
    assistantActions: defineTable({
      threadId: v.id("assistantThreads"),
      organizationId: v.string(),
      messageId: v.id("assistantMessages"),
      tool: v.string(),
      input: v.string(),
      summary: v.string(),
      details: v.array(vActionDetail),
      /** SHA-256 de ce que montre la carte : l'action est refusée si le contenu a bougé avant le clic. */
      snapshot: v.string(),
      expiresAt: v.number(),
      status: vActionStatus,
      result: v.optional(v.string()),
    }).index("by_thread", ["threadId"]),

    /** Consommation par organisation et par mois, en micro-dollars entiers. */
    assistantUsage: defineTable({
      organizationId: v.string(),
      month: v.string(),
      costMicros: v.number(),
      reservedMicros: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
    }).index("by_org_month", ["organizationId", "month"]),

    /** Clé Anthropic ou OpenRouter de l'organisation, scellée (`@hgdc/assistant/secret`), jamais rendue. */
    assistantKeys: defineTable({
      organizationId: v.string(),
      sealed: v.string(),
      hint: v.string(),
      updatedBy: v.string(),
      updatedAt: v.number(),
    })
      .index("by_org", ["organizationId"])
      .index("by_updated_by", ["updatedBy"]),
  }
}

export type AssistantTables = ReturnType<typeof assistantTables>
export type AssistantDataModel = DataModelFromSchemaDefinition<SchemaDefinition<AssistantTables, true>>
export type ThreadId = GenericId<"assistantThreads">
export type MessageId = GenericId<"assistantMessages">
export type ActionId = GenericId<"assistantActions">
