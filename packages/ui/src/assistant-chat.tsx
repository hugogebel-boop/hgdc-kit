import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, type FormEvent, type KeyboardEvent, type ReactNode } from "react"

import { Badge } from "./badge.tsx"
import { Button } from "./button.tsx"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./card.tsx"
import { cn } from "./cn.ts"
import { Spinner } from "./spinner.tsx"
import { Textarea } from "./textarea.tsx"

/*
 * Conversation avec un assistant (Portal, Mail, Docs) : bulles de la personne, réponses rendues
 * par le produit (Markdown), pastilles des outils consultés, cartes d'action à confirmer et zone
 * de saisie. Le kit ne connaît ni le modèle ni le Markdown : le produit passe le texte rendu.
 */

export type AssistantToolStatus = "running" | "done" | "error"
export type AssistantTool = { id: string; label: string; status: AssistantToolStatus }
export type AssistantActionStatus = "pending" | "confirmed" | "cancelled" | "failed"

/** La liste des messages, dans l'ordre. */
export function AssistantConversation({ className, ...props }: React.ComponentProps<"ol">): React.JSX.Element {
  return (
    <ol
      data-slot="assistant-conversation"
      aria-label="Conversation"
      className={cn("grid gap-6", className)}
      {...props}
    />
  )
}

/** Ce que la personne a écrit, en bulle à droite. */
export function AssistantUserMessage({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <li data-slot="assistant-user-message" className="flex min-w-0 justify-end">
      <p className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm break-words whitespace-pre-wrap">{children}</p>
    </li>
  )
}

/** Les outils consultés pendant une réponse ; une pastille tourne tant que l'outil travaille. */
export function AssistantToolChips({
  tools,
  label = "Ce que l'assistant a consulté",
}: {
  tools: ReadonlyArray<AssistantTool>
  label?: string
}): React.JSX.Element | null {
  if (!tools.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {tools.map((tool) => (
        <li key={tool.id}>
          <Badge tone={tool.status === "error" ? "destructive" : "neutral"}>
            {tool.status === "running" ? <Spinner size={3} /> : null}
            {tool.label}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

/**
 * Une réponse : pastilles, puis le texte rendu par le produit (`children`), puis les cartes.
 * `waiting` : rien d'écrit encore, une ligne d'attente à la place du texte.
 */
export function AssistantReply({
  tools = [],
  waiting = false,
  waitingLabel = "L'assistant réfléchit…",
  error = false,
  actions,
  children,
}: {
  tools?: ReadonlyArray<AssistantTool>
  waiting?: boolean
  waitingLabel?: string
  /** Réponse en échec : le texte passe en couleur d'erreur. */
  error?: boolean
  /** Cartes d'action rattachées à cette réponse. */
  actions?: ReactNode
  children?: ReactNode
}): React.JSX.Element {
  return (
    <li data-slot="assistant-reply" className="grid min-w-0 gap-3">
      <AssistantToolChips tools={tools} />
      {waiting ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size={4} />
          {waitingLabel}
        </p>
      ) : (
        <div className={cn("text-sm leading-relaxed break-words", error && "text-destructive")}>{children}</div>
      )}
      {actions}
    </li>
  )
}

const ACTION_BADGE: Record<
  Exclude<AssistantActionStatus, "pending">,
  { tone: "success" | "destructive" | "neutral"; label: string }
> = {
  confirmed: { tone: "success", label: "Fait" },
  failed: { tone: "destructive", label: "Échec" },
  cancelled: { tone: "neutral", label: "Annulé" },
}

/**
 * Une écriture proposée par l'assistant, qui n'a lieu qu'au clic sur « Confirmer ». Une fois
 * traitée, la carte garde son état (fait, annulé, échec et sa raison).
 */
export function AssistantActionCard({
  title,
  details = [],
  status,
  result,
  onConfirm,
  onCancel,
  confirming = false,
  cancelling = false,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
}: {
  title: ReactNode
  details?: ReadonlyArray<{ label: string; value: string }>
  status: AssistantActionStatus
  /** Raison d'un échec. */
  result?: string | null
  onConfirm: () => void
  onCancel: () => void
  confirming?: boolean
  cancelling?: boolean
  confirmLabel?: string
  cancelLabel?: string
}): React.JSX.Element {
  const badge = status === "pending" ? null : ACTION_BADGE[status]
  return (
    <Card data-slot="assistant-action-card" className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      {details.length ? (
        <CardContent>
          <dl className="grid gap-2 text-sm">
            {details.map((row) => (
              <div key={row.label} className="grid gap-0.5">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="break-words whitespace-pre-wrap">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      ) : null}
      <CardFooter className="justify-start">
        {badge ? (
          <Badge tone={badge.tone}>{status === "failed" && result ? `${badge.label} : ${result}` : badge.label}</Badge>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" isLoading={confirming} disabled={cancelling} onClick={onConfirm}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} data-icon="inline-start" />
              {confirmLabel}
            </Button>
            <Button size="sm" variant="ghost" isLoading={cancelling} disabled={confirming} onClick={onCancel}>
              <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" />
              {cancelLabel}
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}

/** Des demandes d'exemple, pour une conversation vide : un clic remplit la saisie. */
export function AssistantExamples({
  examples,
  onPick,
  disabled = false,
  label = "Par exemple :",
}: {
  examples: ReadonlyArray<string>
  onPick: (example: string) => void
  disabled?: boolean
  label?: string
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <li key={example}>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onPick(example)}>
              {example}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * La saisie : Entrée envoie, Maj+Entrée va à la ligne (et rien pendant une composition IME).
 * `busy` : une réponse est en cours, l'envoi attend.
 */
export function AssistantComposer({
  value,
  onValueChange,
  onSubmit,
  disabled = false,
  busy = false,
  sending = false,
  label = "Ta demande",
  placeholder = "Demande quelque chose à l'assistant…",
  sendLabel = "Envoyer",
  hint = "Entrée pour envoyer, Maj+Entrée pour aller à la ligne.",
  maxLength = 4000,
}: {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  busy?: boolean
  sending?: boolean
  label?: string
  placeholder?: string
  sendLabel?: string
  hint?: ReactNode
  maxLength?: number
}): React.JSX.Element {
  const fieldId = useId()
  const canSend = !disabled && !busy && !sending && value.trim().length > 0

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (canSend) onSubmit()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form data-slot="assistant-composer" onSubmit={submit} className="grid gap-2">
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Textarea
          id={fieldId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          className="pr-14"
        />
        <Button
          type="submit"
          size="icon"
          aria-label={sendLabel}
          className="absolute right-2 bottom-2"
          disabled={!canSend}
          isLoading={sending}
        >
          <HugeiconsIcon icon={ArrowUp02Icon} />
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </form>
  )
}
