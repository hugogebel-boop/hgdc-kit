/*
 * La partie Convex de l'assistant : tables, validateurs et fonctions de base de données, à
 * appeler depuis les fonctions du produit. Le kit ne déclare aucune fonction publique : le
 * produit pose sa garde (`requireOrgMember` de `@hgdc/auth/convex`, ou la sienne) puis passe la
 * personne vérifiée (`Speaker`). Chaque fonction revérifie qu'une conversation, un message ou une
 * action appartient à cette personne dans cette organisation.
 *
 * Un module par responsabilité, sous `convex/` : tables, contexte, conversations et tours,
 * crédits, outils et cartes, clés, entretien, nLPD. Ce fichier n'en expose que l'API publique,
 * inchangée : un produit importe toujours `@hgdc/assistant/convex`.
 */

export {
  assistantTables,
  vActionDetail,
  vActionStatus,
  vMessageStatus,
  vToolChip,
  type ActionDetail,
  type ActionId,
  type AssistantDataModel,
  type AssistantTables,
  type MessageId,
  type ThreadId,
  type ToolChip,
} from "./convex/schema.ts"
export {
  ACTION_TTL_MS,
  MAX_TEXT,
  readOnly,
  RESERVE_MICROS,
  STUCK_AFTER_MS,
  TURN_TEXTS,
  type AssistantReader,
  type AssistantWriter,
  type ReadOnlyCtx,
  type Speaker,
  type TurnTexts,
} from "./convex/context.ts"
export { readStatus, spentMicros } from "./convex/credits.ts"
export { ownKey, removeKey, storeKey } from "./convex/keys.ts"
export {
  deleteThread,
  finishTurn,
  listThreads,
  noteEvent,
  ownThread,
  progressMessage,
  readThread,
  startTurn,
  threadTitle,
  turnContext,
  vFinishTurn,
  vProgress,
} from "./convex/threads.ts"
export {
  cancelAction,
  confirmAction,
  runProposeTool,
  runReadTool,
  runWriteTool,
  TRIFECTA_DETAIL,
  type Card,
  type CardKind,
  type ConfirmHandlers,
  type ReadHandlers,
  type WriteHandlers,
} from "./convex/actions.ts"
export { failStuckTurns, PURGE_BATCH, purgeIdleThreads } from "./convex/purge.ts"
export { eraseUser, exportUser } from "./convex/privacy.ts"
