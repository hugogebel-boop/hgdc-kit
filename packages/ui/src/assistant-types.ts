import type { IconSvgElement } from "@hugeicons/react"

import type { AssistantActionStatus, AssistantTool } from "./assistant-chat.tsx"

/** État de l'assistant pour l'organisation (`readStatus`). */
export type AssistantStatus = {
  ready: boolean
  ownKey: { hint: string } | null
  credits: { used: number; limit: number }
}

export type AssistantThreadSummary = { _id: string; title: string; updatedAt: number }

export type AssistantMessageStatus = "pending" | "streaming" | "done" | "error"

export type AssistantMessage = {
  _id: string
  role: "user" | "assistant"
  text: string
  status: AssistantMessageStatus
  tools: ReadonlyArray<AssistantTool>
}

export type AssistantAction = {
  _id: string
  messageId: string
  summary: string
  details?: ReadonlyArray<{ label: string; value: string }>
  status: AssistantActionStatus
  result?: string | null
}

/** Une conversation ouverte (`readThread`). */
export type AssistantThread = {
  /** L'historique a atteint sa taille maximale : une nouvelle conversation s'impose. */
  full?: boolean
  messages: ReadonlyArray<AssistantMessage>
  actions: ReadonlyArray<AssistantAction>
}

/** La page ouverte, que l'assistant prend comme sujet tant que la personne ne la retire pas. */
export type AssistantSubject = {
  /** « Campagne « Octobre » », « Déploiement abc123 ». */
  label: string
  icon?: IconSvgElement
  attached: boolean
  onAttachedChange: (attached: boolean) => void
  /** Bouton pour la rattacher : « Parler de ce déploiement ». */
  attachLabel: string
}

/** Une demande venue d'un bouton de la page (« Écrire avec l'assistant ») : part une seule fois par `nonce`. */
export type AssistantRequest = { prompt?: string; nonce: number }
