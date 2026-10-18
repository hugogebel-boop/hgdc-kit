import Add01Icon from "@hugeicons/core-free-icons/Add01Icon"
import AiMagicIcon from "@hugeicons/core-free-icons/AiMagicIcon"
import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon"
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"

import {
  AssistantActionCard,
  AssistantComposer,
  AssistantConversation,
  AssistantExamples,
  AssistantReply,
  AssistantUserMessage,
  type AssistantActionStatus,
  type AssistantTool,
} from "./assistant-chat.tsx"
import { Button } from "./button.tsx"
import { cn } from "./cn.ts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx"
import { formatRelative } from "./relative-time.tsx"
import { Spinner } from "./spinner.tsx"

/*
 * Le corps complet de l'assistant, à passer tel quel à `AppShell` (`assistant.panel`) : barre
 * des conversations et des crédits, fil qui suit la réponse, pastilles d'outils, cartes à
 * confirmer, états vide, non branché, crédits épuisés, chargement et erreur, saisie avec la page
 * ouverte en sujet. Les formes de données sont celles que rend `@hgdc/assistant/convex`
 * (`readStatus`, `listThreads`, `readThread`) : le produit les passe sans les transformer.
 * Le kit ne connaît ni Convex ni le Markdown : le produit rend le texte (`renderText`).
 */

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

export type AssistantLabels = {
  welcomeTitle: string
  welcomeDescription: string
  notReadyTitle: string
  notReadyDescription: string
  exhaustedTitle: string
  exhaustedDescription: string
  placeholder: string
  placeholderBusy: string
  composerLabel: string
  history: string
  noHistory: string
  newThread: string
  deleteThread: string
  deleteConfirm: string
  deleteYes: string
  deleteNo: string
  loadError: string
  full: string
  sendError: string
  creditsLeft: (remaining: number) => string
  ownKey: (hint: string) => string
  notReadyShort: string
  detach: string
}

/** Tutoiement de la console ; un produit qui vouvoie (clients de Portal) remplace ce qu'il faut. */
export const ASSISTANT_LABELS: AssistantLabels = {
  welcomeTitle: "Qu'est-ce que je fais pour toi ?",
  welcomeDescription:
    "Je lis ce que tu vois dans l'application et je t'aide à t'y retrouver. Je te demande toujours avant de modifier ou d'envoyer quoi que ce soit.",
  notReadyTitle: "L'assistant n'est pas encore branché",
  notReadyDescription: "Il manque une clé pour le modèle. Un administrateur peut l'ajouter dans les réglages.",
  exhaustedTitle: "Les crédits du mois sont utilisés",
  exhaustedDescription:
    "Le compteur repart le 1er du mois. Un administrateur peut aussi ajouter la clé de l'organisation dans les réglages.",
  placeholder: "Demande-moi quelque chose",
  placeholderBusy: "L'assistant répond…",
  composerLabel: "Message pour l'assistant",
  history: "Conversations précédentes",
  noHistory: "Aucune conversation pour l'instant",
  newThread: "Nouvelle conversation",
  deleteThread: "Effacer cette conversation",
  deleteConfirm: "Effacer pour de bon ?",
  deleteYes: "Effacer",
  deleteNo: "Garder",
  loadError: "Cette conversation ne s'affiche pas. Réessaie dans un instant.",
  full: "Cette conversation est pleine. Ouvre une nouvelle conversation pour continuer.",
  sendError: "Le message n'est pas parti. Réessaie dans un instant.",
  creditsLeft: (remaining) =>
    remaining <= 0
      ? "Plus de crédits ce mois-ci"
      : `${remaining} crédit${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""} ce mois-ci`,
  ownKey: (hint) => `Clé de l'organisation ••••${hint}`,
  notReadyShort: "Pas encore branché",
  detach: "Ne plus parler de cette page",
}

/** Le message d'une erreur Convex (`ConvexError` avec un texte) ; sinon `fallback`. */
export function assistantErrorText(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data: unknown }).data
    if (typeof data === "string" && data.trim()) return data
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message: unknown }).message
      if (typeof message === "string" && message.trim()) return message
    }
  }
  return fallback
}

/**
 * Un lien écrit par l'assistant. Un chemin de l'application (`/…`) reste un lien interne ; une
 * adresse `https:` s'ouvre dans un nouvel onglet, sans référent ni accès à la page, avec son domaine
 * affiché à côté du texte (un texte trompeur ne cache pas la destination) ; tout le reste
 * (`javascript:`, `http:`, `data:`…) devient du texte. À passer au rendu Markdown du produit
 * (`components={{ a: AssistantLink }}`) ; `renderInternal` pour le lien du routeur.
 */
export function AssistantLink({
  href,
  children,
  renderInternal,
}: {
  href?: string | undefined
  children?: ReactNode
  renderInternal?: (href: string, children: ReactNode) => ReactNode
}): React.JSX.Element {
  const value = (href ?? "").trim()
  const className = "font-medium underline underline-offset-2"
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return renderInternal ? (
      <>{renderInternal(value, children)}</>
    ) : (
      <a href={value} className={className}>
        {children}
      </a>
    )
  }
  let url: URL | null = null
  try {
    url = new URL(value)
  } catch {
    url = null
  }
  if (!url || url.protocol !== "https:" || url.username || url.password) return <span>{children}</span>
  return (
    <a href={url.href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
      <span className="ml-1 text-xs font-normal text-muted-foreground no-underline">({url.hostname})</span>
    </a>
  )
}

const URL_IN_TEXT = /(https:\/\/[^\s<>"')]+)/g

/** Le rendu par défaut : texte brut en paragraphes, adresses https en liens sûrs. Aucun HTML. */
export function renderPlainText(text: string): ReactNode {
  return text.split(/\n{2,}/).map((paragraph, i) => (
    <p key={i} className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">
      {paragraph.split(URL_IN_TEXT).map((part, j) =>
        j % 2 === 1 ? (
          <AssistantLink key={j} href={part}>
            {part}
          </AssistantLink>
        ) : (
          part
        ),
      )}
    </p>
  ))
}

function remainingCredits(status: AssistantStatus): number {
  return Math.max(0, Math.floor(status.credits.limit - status.credits.used))
}

/** La ligne sous la barre : crédits restants, ou la clé de l'organisation. */
export function AssistantCredits({
  status,
  labels = ASSISTANT_LABELS,
}: {
  status: AssistantStatus | undefined
  labels?: Pick<AssistantLabels, "creditsLeft" | "ownKey" | "notReadyShort">
}): React.JSX.Element {
  return (
    <p data-slot="assistant-credits" className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
      {status === undefined
        ? " "
        : status.ownKey
          ? labels.ownKey(status.ownKey.hint)
          : !status.ready
            ? labels.notReadyShort
            : labels.creditsLeft(remainingCredits(status))}
    </p>
  )
}

/** Les conversations précédentes et « Nouvelle conversation ». */
export function AssistantHistory({
  threads,
  threadId,
  onThreadChange,
  now,
  labels = ASSISTANT_LABELS,
}: {
  threads: ReadonlyArray<AssistantThreadSummary> | undefined
  threadId: string | null
  onThreadChange: (threadId: string | null) => void
  now?: number
  labels?: Pick<AssistantLabels, "history" | "noHistory" | "newThread">
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={labels.history}
              title={labels.history}
              disabled={!threads?.length}
            />
          }
        >
          <HugeiconsIcon icon={Clock01Icon} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{labels.history}</DropdownMenuLabel>
            {threads?.length ? (
              threads.map((thread) => (
                <DropdownMenuItem
                  key={thread._id}
                  onClick={() => onThreadChange(thread._id)}
                  aria-current={thread._id === threadId ? "true" : undefined}
                  className="aria-[current]:font-medium"
                >
                  <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(thread.updatedAt, now)}
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{labels.noHistory}</p>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={labels.newThread}
        title={labels.newThread}
        disabled={threadId === null}
        onClick={() => onThreadChange(null)}
      >
        <HugeiconsIcon icon={Add01Icon} aria-hidden />
      </Button>
    </div>
  )
}

/** Un état sans conversation : accueil, non branché, crédits épuisés. */
function AssistantState({
  title,
  description,
  tone = "neutral",
  children,
}: {
  title: string
  description: ReactNode
  tone?: "neutral" | "warning"
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div data-slot="assistant-state" className="grid gap-4 py-4">
      <span
        aria-hidden
        className={cn(
          "grid size-10 place-items-center rounded-2xl",
          tone === "warning" ? "bg-status-paused/15 text-status-paused-ink" : "bg-muted text-foreground",
        )}
      >
        <HugeiconsIcon icon={tone === "warning" ? Alert02Icon : AiMagicIcon} strokeWidth={1.8} className="size-5" />
      </span>
      <div className="grid gap-1.5">
        <p className="font-heading text-lg leading-snug font-semibold text-balance">{title}</p>
        <div className="text-sm text-pretty text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  )
}

/** La page ouverte en pastille au-dessus de la saisie, ou le lien pour la rattacher. */
export function AssistantSubjectChip({
  subject,
  labels = ASSISTANT_LABELS,
}: {
  subject: AssistantSubject
  labels?: Pick<AssistantLabels, "detach">
}): React.JSX.Element {
  if (!subject.attached) {
    return (
      <button
        type="button"
        onClick={() => subject.onAttachedChange(true)}
        className="touch-target w-fit rounded-lg text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {subject.attachLabel}
      </button>
    )
  }
  return (
    <span
      data-slot="assistant-subject"
      className="flex w-fit max-w-full min-w-0 soft-in items-center gap-1.5 rounded-full bg-muted py-1 pr-1 pl-2.5 text-xs font-medium motion-reduce:animate-none"
    >
      {subject.icon ? <HugeiconsIcon icon={subject.icon} aria-hidden className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{subject.label}</span>
      <button
        type="button"
        aria-label={labels.detach}
        title={labels.detach}
        onClick={() => subject.onAttachedChange(false)}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden className="size-3" />
      </button>
    </span>
  )
}

function DeleteThread({
  onDelete,
  labels,
}: {
  onDelete: () => Promise<void>
  labels: Pick<AssistantLabels, "deleteThread" | "deleteConfirm" | "deleteYes" | "deleteNo">
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="touch-target flex w-fit items-center gap-1 rounded-lg text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <HugeiconsIcon icon={Delete02Icon} aria-hidden className="size-3.5" />
        {labels.deleteThread}
      </button>
    )
  }
  return (
    <div role="group" aria-label={labels.deleteThread} className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{labels.deleteConfirm}</span>
      <Button
        size="xs"
        variant="destructive"
        isLoading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onDelete()
          } finally {
            setBusy(false)
            setAsking(false)
          }
        }}
      >
        {labels.deleteYes}
      </Button>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
        {labels.deleteNo}
      </Button>
    </div>
  )
}

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
