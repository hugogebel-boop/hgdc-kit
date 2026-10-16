import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "./button.tsx"
import { useCopy } from "./copy-button.tsx"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog.tsx"
import { Input } from "./input.tsx"
import { Kbd, isApplePlatform } from "./kbd.tsx"
import { errorMessage } from "./sonner.tsx"

/** Le nom à recopier, copiable d'un clic pour qui préfère coller. */
function NameChip({ name }: { name: string }): React.JSX.Element {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      aria-label={copied ? "Copié" : `Copier ${name}`}
      title={copied ? "Copié" : "Copier"}
      onClick={() => void copy(name)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-muted px-2 py-0.5 align-middle font-medium text-foreground outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{name}</span>
      <HugeiconsIcon
        key={copied ? "ok" : "copy"}
        icon={copied ? Tick02Icon : Copy01Icon}
        aria-hidden
        className="size-3.5 shrink-0 pop-in"
      />
    </button>
  )
}

/** Recopié, aux espaces près en début et en fin. */
export function matchesConfirmation(typed: string, name: string): boolean {
  return typed.trim() === name.trim()
}

/**
 * Confirmation d'une action qui ne se rattrape pas (supprimer un domaine, un projet, une clé).
 * Avec `name`, il faut le recopier avant que le bouton s'active : on ne supprime pas par
 * réflexe. `Ctrl+Entrée` (`⌘+Entrée` sur Mac) confirme, `Échap` annule.
 *
 * `onConfirm` rend une promesse : le bouton tourne, la boîte ne se ferme qu'une fois l'action
 * faite. Si elle échoue, la boîte reste ouverte et l'erreur s'affiche en toast
 * (`formatError` pour traduire une erreur du serveur). Pour ce qui se défait, `toastUndo`.
 */
/* oxlint-disable react/refs -- `view` vient d'un ref lu au rendu, voulu (voir plus bas). */
export function DestructiveDialog({
  open,
  onOpenChange,
  title,
  question,
  consequence,
  name,
  confirmLabel,
  onConfirm,
  formatError = (error) => errorMessage(error),
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** « Supprimer le domaine » */
  title: string
  /** « Tu veux vraiment supprimer acme.ch ? » */
  question: ReactNode
  /** Ce qui disparaît avec, en une phrase. */
  consequence?: ReactNode
  /** À recopier pour confirmer. Sans lui, un simple bouton suffit. */
  name?: string
  /** Libellé du bouton, par défaut le titre. */
  confirmLabel?: string
  onConfirm: () => Promise<unknown>
  formatError?: (error: unknown) => string
}): React.JSX.Element {
  // Le parent vide souvent son état à la fermeture : le dernier contenu ouvert reste affiché le
  // temps de l'animation de sortie. Seul un ref le garde sans rendu supplémentaire.
  const shown = useRef({ title, question, consequence, name, confirmLabel })
  if (open) shown.current = { title, question, consequence, name, confirmLabel }
  const view = shown.current
  const [typed, setTyped] = useState("")
  const [pending, setPending] = useState(false)
  const ready = !pending && (view.name === undefined || matchesConfirmation(typed, view.name))

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setTyped("")
  }

  async function confirm() {
    if (!ready) return
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setPending(false)
    }
  }

  const mod = isApplePlatform() ? "⌘" : "Ctrl"

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        data-slot="destructive-dialog"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void confirm()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{view.title}</DialogTitle>
          <DialogDescription render={<div />} className="grid gap-1 text-[15px]">
            <p>{view.question}</p>
            {view.consequence ? <p>{view.consequence}</p> : null}
            <p className="font-semibold text-destructive">Impossible de revenir en arrière.</p>
          </DialogDescription>
        </DialogHeader>
        {view.name !== undefined ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {/* Pas de <label> : le bouton Copier y entrerait dans le nom accessible du champ. */}
            <p className="text-[15px] leading-7 text-muted-foreground">
              Tape <NameChip name={view.name} /> pour confirmer.
            </p>
            <Input
              aria-label={`Tape ${view.name} pour confirmer`}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={view.name}
              aria-invalid={typed.length > 0 && !view.name.startsWith(typed) ? true : undefined}
            />
          </form>
        ) : null}
        <DialogFooter className="sm:justify-start">
          <Button variant="destructive" isLoading={pending} disabled={!ready} onClick={() => void confirm()}>
            {view.confirmLabel ?? view.title}
            <Kbd aria-hidden className="ml-1 hidden bg-current/10 text-current lg:inline-flex">
              {mod}
            </Kbd>
            <Kbd aria-hidden className="hidden bg-current/10 text-current lg:inline-flex">
              ↵
            </Kbd>
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Annuler
            <Kbd aria-hidden className="ml-1 hidden lg:inline-flex">
              Échap
            </Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
/* oxlint-enable react/refs */
