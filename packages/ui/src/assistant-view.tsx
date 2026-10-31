import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"

import { AssistantCredits, AssistantHistory, remainingCredits } from "./assistant-bar.tsx"
import {
  AssistantActionCard,
  AssistantComposer,
  AssistantConversation,
  AssistantExamples,
  AssistantReply,
  AssistantUserMessage,
} from "./assistant-chat.tsx"
import { ASSISTANT_LABELS, assistantErrorText, type AssistantLabels } from "./assistant-labels.ts"
import { AssistantState, AssistantSubjectChip, DeleteThread } from "./assistant-parts.tsx"
import { renderPlainText } from "./assistant-text.tsx"
import type {
  AssistantRequest,
  AssistantStatus,
  AssistantSubject,
  AssistantThread,
  AssistantThreadSummary,
} from "./assistant-types.ts"
import { cn } from "./cn.ts"
import { Spinner } from "./spinner.tsx"

export { AssistantCredits, AssistantHistory } from "./assistant-bar.tsx"
export { ASSISTANT_LABELS, assistantErrorText, type AssistantLabels } from "./assistant-labels.ts"
export { AssistantSubjectChip } from "./assistant-parts.tsx"
export { AssistantLink, renderPlainText } from "./assistant-text.tsx"
export type {
  AssistantAction,
  AssistantMessage,
  AssistantMessageStatus,
  AssistantRequest,
  AssistantStatus,
  AssistantSubject,
  AssistantThread,
  AssistantThreadSummary,
} from "./assistant-types.ts"

/*
 * Le corps complet de l'assistant, à passer tel quel à `AppShell` (`assistant.panel`) : barre
 * des conversations et des crédits, fil qui suit la réponse, pastilles d'outils, cartes à
 * confirmer, états vide, non branché, crédits épuisés, chargement et erreur, saisie avec la page
 * ouverte en sujet. Les formes de données sont celles que rend `@hgdc/assistant/convex`
 * (`readStatus`, `listThreads`, `readThread`) : le produit les passe sans les transformer.
 * Le kit ne connaît ni Convex ni le Markdown : le produit rend le texte (`renderText`).
 */

export type AssistantViewProps = {
  /** `undefined` pendant le chargement. */
  status: AssistantStatus | undefined
  threads: ReadonlyArray<AssistantThreadSummary> | undefined
  /** Conversation ouverte ; `null` : une nouvelle. */
  threadId: string | null
  onThreadChange: (threadId: string | null) => void
  /** La conversation ouverte ; `undefined` pendant son chargement, `null` si elle ne se lit pas. */
  thread: AssistantThread | null | undefined
  /**
   * Le texte d'une réponse, rendu par le produit (Markdown avec `AssistantLink` pour les liens,
   * sans image). Par défaut : texte brut, paragraphes, adresses https en liens sûrs.
   */
  renderText?: (text: string) => ReactNode
  /** Envoie la demande ; une erreur remet le texte dans la saisie et s'affiche au-dessus. */
  onSend: (text: string) => Promise<void>
  onConfirm: (actionId: string) => Promise<void>
  onCancel: (actionId: string) => Promise<void>
  onDeleteThread?: (threadId: string) => Promise<void>
  examples?: ReadonlyArray<string>
  /** Remplace le titre et le texte d'accueil (une page ouverte appelle un autre accueil). */
  welcome?: { title?: string; description?: ReactNode }
  /** Sous l'état « non branché » ou « crédits épuisés » : un lien vers les réglages, pour un admin. */
  setup?: ReactNode
  subject?: AssistantSubject | null
  request?: AssistantRequest | null
  labels?: Partial<AssistantLabels>
  /** Instant de référence des dates relatives (tests, captures). */
  now?: number
  className?: string
}

/** Le panneau de l'assistant, prêt pour la colonne de `AppShell`. */
export function AssistantView({
  status,
  threads,
  threadId,
  onThreadChange,
  thread,
  renderText = renderPlainText,
  onSend,
  onConfirm,
  onCancel,
  onDeleteThread,
  examples = [],
  welcome,
  setup,
  subject,
  request,
  labels: overrides,
  now,
  className,
}: AssistantViewProps): React.JSX.Element {
  const labels: AssistantLabels = { ...ASSISTANT_LABELS, ...overrides }
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<{ id: string; kind: "confirm" | "cancel" } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const messages = threadId && thread ? thread.messages : []
  const last = messages.at(-1)
  const answering = last?.status === "pending" || last?.status === "streaming"
  const busy = sending || answering
  const exhausted = Boolean(status && status.ready && !status.ownKey && remainingCredits(status) <= 0)
  const full = Boolean(threadId && thread?.full)
  const blocked = status === undefined || !status.ready || exhausted || full

  // Le fil suit la réponse en cours, sauf si la personne remonte pour relire.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTo({ top: el.scrollHeight })
  }, [thread])

  async function submit(text: string) {
    const value = text.trim()
    if (!value || busy || blocked) return
    setSending(true)
    setSendError(null)
    setDraft("")
    try {
      await onSend(value)
      requestAnimationFrame(() => {
        const el = scroller.current
        if (el) el.scrollTo({ top: el.scrollHeight })
      })
    } catch (error) {
      setDraft(value)
      setSendError(assistantErrorText(error, labels.sendError))
    } finally {
      setSending(false)
    }
  }

  async function act(id: string, kind: "confirm" | "cancel") {
    setActionBusy({ id, kind })
    try {
      await (kind === "confirm" ? onConfirm(id) : onCancel(id))
    } catch (error) {
      setSendError(assistantErrorText(error, labels.sendError))
    } finally {
      setActionBusy(null)
    }
  }

  // Une demande venue de la page part une seule fois ; sans texte, elle met le curseur dans la saisie.
  const handled = useRef<number | null>(null)
  const onRequest = useEffectEvent((next: AssistantRequest) => {
    if (handled.current === next.nonce) return
    handled.current = next.nonce
    if (next.prompt) void submit(next.prompt)
  })
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- la demande est un clic sur la page, transmis par prop : exécutée une seule fois par nonce.
    if (request) onRequest(request)
  }, [request])

  let body: ReactNode
  if (status === undefined) {
    body = (
      <div className="grid place-items-center py-16">
        <Spinner size={5} label="Chargement" />
      </div>
    )
  } else if (!status.ready) {
    body = (
      <AssistantState title={labels.notReadyTitle} description={labels.notReadyDescription} tone="warning">
        {setup}
      </AssistantState>
    )
  } else if (!threadId) {
    body = exhausted ? (
      <AssistantState title={labels.exhaustedTitle} description={labels.exhaustedDescription} tone="warning">
        {setup}
      </AssistantState>
    ) : (
      <AssistantState
        title={welcome?.title ?? labels.welcomeTitle}
        description={welcome?.description ?? labels.welcomeDescription}
      >
        {examples.length ? <AssistantExamples examples={examples} onPick={(e) => void submit(e)} /> : null}
      </AssistantState>
    )
  } else if (thread === undefined) {
    body = (
      <div className="grid place-items-center py-16">
        <Spinner size={5} label="Chargement de la conversation" />
      </div>
    )
  } else if (thread === null) {
    body = (
      <p role="alert" className="py-8 text-sm text-destructive">
        {labels.loadError}
      </p>
    )
  } else {
    body = (
      <AssistantConversation className="gap-5">
        {thread.messages.map((message) =>
          message.role === "user" ? (
            <AssistantUserMessage key={message._id}>{message.text}</AssistantUserMessage>
          ) : (
            <AssistantReply
              key={message._id}
              tools={message.tools}
              waiting={!message.text && (message.status === "pending" || message.status === "streaming")}
              error={message.status === "error"}
              actions={thread.actions
                .filter((action) => action.messageId === message._id)
                .map((action) => (
                  <AssistantActionCard
                    key={action._id}
                    title={action.summary}
                    details={action.details ?? []}
                    status={action.status}
                    result={action.result ?? null}
                    confirming={actionBusy?.id === action._id && actionBusy.kind === "confirm"}
                    cancelling={actionBusy?.id === action._id && actionBusy.kind === "cancel"}
                    onConfirm={() => void act(action._id, "confirm")}
                    onCancel={() => void act(action._id, "cancel")}
                  />
                ))}
            >
              {message.text ? renderText(message.text) : null}
            </AssistantReply>
          ),
        )}
      </AssistantConversation>
    )
  }

  return (
    <div data-slot="assistant-view" className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex min-h-11 shrink-0 items-center gap-2 px-4 xl:pr-2 xl:pl-5">
        <div className="min-w-0 flex-1">
          <AssistantCredits status={status} labels={labels} />
        </div>
        <AssistantHistory
          threads={threads}
          threadId={threadId}
          onThreadChange={(id) => {
            setSendError(null)
            onThreadChange(id)
          }}
          labels={labels}
          {...(now === undefined ? {} : { now })}
        />
      </div>

      <div
        ref={scroller}
        data-slot="assistant-scroller"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4 xl:pr-3 xl:pl-5"
      >
        {body}
      </div>

      <div className="grid shrink-0 gap-2 border-t border-foreground/5 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] xl:pr-3 xl:pl-5">
        {sendError ? (
          <p role="alert" className="text-sm text-destructive">
            {sendError}
          </p>
        ) : null}
        {full ? <p className="text-sm text-muted-foreground">{labels.full}</p> : null}
        {subject ? <AssistantSubjectChip subject={subject} labels={labels} /> : null}
        <AssistantComposer
          value={draft}
          onValueChange={setDraft}
          onSubmit={() => void submit(draft)}
          disabled={blocked}
          busy={answering}
          sending={sending}
          label={labels.composerLabel}
          placeholder={answering ? labels.placeholderBusy : labels.placeholder}
          hint={null}
        />
        {threadId && onDeleteThread && thread ? (
          <DeleteThread
            labels={labels}
            onDelete={async () => {
              await onDeleteThread(threadId)
              onThreadChange(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
