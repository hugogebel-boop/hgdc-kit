import { creditsFromMicros, currentMonth } from "../model.ts"
import { db, type AssistantReader, type AssistantWriter } from "./context.ts"
import { ownKey } from "./keys.ts"
import type { MessageId } from "./schema.ts"

/*
 * Crédits : une réservation au début du tour (dans la même transaction que le contrôle), ajustée
 * au coût réel à la fin, en micro-dollars entiers. Une réponse qui n'aboutit jamais (délai, panne)
 * garde sa réservation comme coût. Le débit passe par le message, pas par la conversation.
 */

async function usageRow(ctx: AssistantReader, organizationId: string, month: string) {
  return await db(ctx)
    .query("assistantUsage")
    .withIndex("by_org_month", (q) => q.eq("organizationId", organizationId).eq("month", month))
    .first()
}

/** Ajoute `delta` à la consommation du mois (la réservation ne descend jamais sous zéro). Interne au kit. */
export async function adjustUsage(
  ctx: AssistantWriter,
  organizationId: string,
  month: string,
  delta: { costMicros?: number; reservedMicros?: number; inputTokens?: number; outputTokens?: number },
): Promise<void> {
  const row = await usageRow(ctx, organizationId, month)
  const next = {
    costMicros: (row?.costMicros ?? 0) + (delta.costMicros ?? 0),
    reservedMicros: Math.max(0, (row?.reservedMicros ?? 0) + (delta.reservedMicros ?? 0)),
    inputTokens: (row?.inputTokens ?? 0) + (delta.inputTokens ?? 0),
    outputTokens: (row?.outputTokens ?? 0) + (delta.outputTokens ?? 0),
  }
  if (row) await db(ctx).patch(row._id, next)
  else await db(ctx).insert("assistantUsage", { organizationId, month, ...next })
}

/** Solde un tour : lève la réservation et débite `costMicros` (la réservation entière si inconnu). Interne au kit. */
export async function settleMessage(
  ctx: AssistantWriter,
  messageId: MessageId,
  cost: { costMicros?: number; costComplete?: boolean; inputTokens?: number; outputTokens?: number } = {},
): Promise<void> {
  const message = await db(ctx).get(messageId)
  if (!message || message.role !== "assistant" || message.settled) return
  const reserved = message.reservedMicros ?? 0
  // Coût inconnu (tour jamais fini) ou partiel (étape rejouée, coupée) : au moins la réservation.
  const charged =
    cost.costMicros === undefined
      ? reserved
      : cost.costComplete === false
        ? Math.max(cost.costMicros, reserved)
        : cost.costMicros
  if (reserved > 0 && message.month) {
    await adjustUsage(ctx, message.organizationId, message.month, {
      reservedMicros: -reserved,
      costMicros: charged,
      inputTokens: cost.inputTokens ?? 0,
      outputTokens: cost.outputTokens ?? 0,
    })
  }
  await db(ctx).patch(messageId, { settled: true, costMicros: charged, credits: creditsFromMicros(charged) })
}

/** Micro-dollars engagés ce mois (débités et réservés). */
export async function spentMicros(ctx: AssistantReader, organizationId: string, now: number = Date.now()) {
  const row = await usageRow(ctx, organizationId, currentMonth(now))
  return (row?.costMicros ?? 0) + (row?.reservedMicros ?? 0)
}

/**
 * L'état de l'assistant pour l'organisation, au format de `AssistantView` (`@hgdc/ui`). `limit` en
 * crédits ; `platformKey` : un modèle de la plateforme est branché (`sovereignReady()` de
 * `@hgdc/assistant/providers`). `ownKeys: false` ignore une clé propre encore enregistrée.
 */
export async function readStatus(
  ctx: AssistantReader,
  organizationId: string,
  options: { limit: number; platformKey: boolean; ownKeys?: boolean },
) {
  const key = options.ownKeys === false ? null : await ownKey(ctx, organizationId)
  return {
    ready: Boolean(key) || options.platformKey,
    ownKey: key ? { hint: key.hint, updatedAt: key.updatedAt } : null,
    credits: { used: creditsFromMicros(await spentMicros(ctx, organizationId)), limit: options.limit },
  }
}
