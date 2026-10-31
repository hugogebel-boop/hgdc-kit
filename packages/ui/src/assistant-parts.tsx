import AiMagicIcon from "@hugeicons/core-free-icons/AiMagicIcon"
import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState, type ReactNode } from "react"

import { ASSISTANT_LABELS, type AssistantLabels } from "./assistant-labels.ts"
import type { AssistantSubject } from "./assistant-types.ts"
import { Button } from "./button.tsx"
import { cn } from "./cn.ts"

/** Un état sans conversation : accueil, non branché, crédits épuisés. */
export function AssistantState({
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

export function DeleteThread({
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
