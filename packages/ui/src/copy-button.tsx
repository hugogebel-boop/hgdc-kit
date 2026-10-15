import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

import { cn } from "./cn.ts"

/** Copie dans le presse-papiers, et dit si c'est fait pendant 1,5 s. */
export function useCopy(): { copied: boolean; copy: (value: string) => Promise<boolean> } {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return {
    copied,
    copy: async (value) => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        return true
      } catch {
        // Presse-papiers refusé (page non sécurisée, permission) : rien n'est annoncé comme copié.
        return false
      }
    },
  }
}

/**
 * Bouton-icône qui copie une valeur ; l'icône devient une coche, et « Copié » est annoncé aux
 * lecteurs d'écran. `showLabel` écrit le libellé à côté de l'icône (« Tout copier »), pour une
 * copie qui n'est pas collée à sa valeur : tout un bloc d'enregistrements DNS, un journal.
 */
export function CopyButton({
  value,
  label = "Copier",
  showLabel = false,
  className,
}: {
  value: string
  label?: string
  /** Libellé visible, qui devient « Copié » le temps de la confirmation. */
  showLabel?: boolean
  className?: string
}): React.JSX.Element {
  const { copied, copy } = useCopy()
  if (showLabel)
    return (
      <button
        type="button"
        onClick={() => void copy(value)}
        data-copied={copied || undefined}
        className={cn(
          "touch-target inline-flex h-8 shrink-0 pressable items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          copied && "text-status-active-ink hover:text-status-active-ink",
          className,
        )}
      >
        <HugeiconsIcon
          key={copied ? "ok" : "copy"}
          icon={copied ? Tick02Icon : Copy01Icon}
          aria-hidden
          className="size-4 pop-in"
        />
        {/* La largeur ne bouge pas quand le libellé change : les deux textes occupent la même case. */}
        <span className="inline-grid">
          <span className={cn("col-start-1 row-start-1", copied && "invisible")}>{label}</span>
          <span aria-hidden className={cn("col-start-1 row-start-1", !copied && "invisible")}>
            Copié
          </span>
        </span>
        <span className="sr-only" aria-live="polite">
          {copied ? "Copié" : ""}
        </span>
      </button>
    )
  return (
    <button
      type="button"
      aria-label={copied ? "Copié" : label}
      title={copied ? "Copié" : label}
      onClick={() => void copy(value)}
      className={cn(
        "touch-target grid size-8 shrink-0 pressable place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        copied && "text-status-active-ink hover:text-status-active-ink",
        className,
      )}
    >
      <HugeiconsIcon
        key={copied ? "ok" : "copy"}
        icon={copied ? Tick02Icon : Copy01Icon}
        aria-hidden
        className="size-4 pop-in"
      />
      <span className="sr-only" aria-live="polite">
        {copied ? "Copié" : ""}
      </span>
    </button>
  )
}

/**
 * Une commande, une valeur DNS, une URL : en police à chasse fixe, sur une ligne qui défile si
 * elle est longue, avec son bouton de copie. `prompt` affiche « $ » devant une commande, sans
 * qu'il soit copié.
 */
export function Snippet({
  value,
  prompt = false,
  label,
  className,
}: {
  value: string
  prompt?: boolean
  /** Nom accessible du bouton : « Copier la commande ». */
  label?: string
  className?: string
}): React.JSX.Element {
  return (
    <div
      data-slot="snippet"
      className={cn("flex min-w-0 items-center gap-2 rounded-2xl bg-foreground/[0.05] py-1.5 pr-1.5 pl-4", className)}
    >
      <pre className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] [scrollbar-width:thin]">
        {prompt ? (
          <span aria-hidden className="mr-2 text-muted-foreground select-none">
            $
          </span>
        ) : null}
        <code>{value}</code>
      </pre>
      <CopyButton value={value} {...(label !== undefined ? { label } : {})} />
    </div>
  )
}
