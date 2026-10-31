import Add01Icon from "@hugeicons/core-free-icons/Add01Icon"
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon"
import { HugeiconsIcon } from "@hugeicons/react"

import { ASSISTANT_LABELS, type AssistantLabels } from "./assistant-labels.ts"
import type { AssistantStatus, AssistantThreadSummary } from "./assistant-types.ts"
import { Button } from "./button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx"
import { formatRelative } from "./relative-time.tsx"

export function remainingCredits(status: AssistantStatus): number {
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
