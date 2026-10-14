import { Collapsible } from "@base-ui/react/collapsible"
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon"
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState, type ReactNode } from "react"

import { Button } from "./button.tsx"
import { cn } from "./cn.ts"
import { CopyButton } from "./copy-button.tsx"

/**
 * Ce qui a échoué, quoi faire, et de quoi le signaler. À la place du contenu qui n'a pas pu se
 * charger (une liste, un graphique), pas en plus : l'écran ne reste jamais blanc ni muet.
 *
 * Le détail technique (message d'origine, pile) est replié : utile au support, illisible pour
 * le reste. L'identifiant se copie d'un clic, pour l'e-mail au support. `onRetry` peut rendre une
 * promesse : le bouton tourne jusqu'à ce qu'elle se règle.
 */
export function ErrorCard({
  title = "Le chargement a échoué",
  children,
  detail,
  reference,
  onRetry,
  retryLabel = "Réessayer",
  action,
  className,
}: {
  title?: ReactNode
  /** Ce que la personne peut faire, en une ou deux phrases. */
  children?: ReactNode
  /** Le message technique, montré sous « Détails » en chasse fixe. */
  detail?: string
  /** Identifiant de la requête ou de l'erreur, à transmettre au support. */
  reference?: string
  onRetry?: () => unknown
  retryLabel?: string
  /** Une autre issue, à côté de « Réessayer » : un lien vers la page de statut. */
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    if (!onRetry) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      role="alert"
      data-slot="error-card"
      className={cn("surface flex flex-col gap-4 rounded-3xl p-5 text-sm sm:p-6", className)}
    >
      <div className="flex items-start gap-3">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div className="grid min-w-0 gap-1">
          <p className="font-heading text-base font-medium text-foreground">{title}</p>
          <div className="text-pretty text-muted-foreground">
            {children ??
              (reference
                ? "Réessaie dans un instant. Si ça continue, écris-nous avec l'identifiant ci-dessous."
                : "Réessaie dans un instant.")}
          </div>
        </div>
      </div>

      {reference ? (
        <div className="flex min-w-0 items-center gap-2 pl-8 text-muted-foreground">
          <span className="shrink-0">Identifiant</span>
          <code className="min-w-0 truncate rounded-md bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-xs text-foreground">
            {reference}
          </code>
          <CopyButton value={reference} label="Copier l'identifiant" />
        </div>
      ) : null}

      {detail ? (
        <Collapsible.Root className="pl-8">
          <Collapsible.Trigger className="group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              aria-hidden
              className="size-3.5 transition-transform duration-(--duration-fast) ease-out group-data-panel-open:rotate-90"
            />
            Détails
          </Collapsible.Trigger>
          <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-base) ease-out data-ending-style:h-0 data-starting-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden">
            <pre className="mt-2 max-h-60 overflow-auto rounded-2xl bg-foreground/[0.05] p-3 font-mono text-xs whitespace-pre-wrap break-all text-foreground">
              {detail}
            </pre>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}

      {onRetry || action ? (
        <div className="flex flex-wrap items-center gap-2 pl-8">
          {onRetry ? (
            <Button variant="outline" size="sm" isLoading={retrying} onClick={() => void retry()}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  )
}
