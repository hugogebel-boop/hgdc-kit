import AiMagicIcon from "@hugeicons/core-free-icons/AiMagicIcon"
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, type ReactNode } from "react"

import { cn } from "./cn.ts"
import { isApplePlatform, Kbd, KbdGroup } from "./kbd.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"

/**
 * L'assistant IA du produit. La coque pose son bouton juste à côté de la recherche et l'ouvre dans
 * une colonne à droite de la page, sur le fond de l'application : la page se rétrécit et se
 * réorganise, jamais recouverte. Sous 1280 px, là où les deux ne tiennent plus côte à côte, une
 * vue dédiée plein écran avec « Retour à la page ». La page reste montée dans les deux cas, et le
 * panneau, une fois ouvert, aussi : rien ne se perd en fermant ou en changeant de largeur.
 */
export type AppShellAssistant = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Le corps de l'assistant : conversation et saisie (`@hgdc/ui/assistant-chat`). La coque pose le
   * titre, la fermeture et le retour à la page ; le panneau occupe la hauteur restante et défile.
   */
  panel: ReactNode
  /** Nom du bouton et titre du panneau : « Assistant » par défaut. */
  label?: string
  /** Lettre du raccourci `Ctrl` (`⌘`) + lettre qui ouvre et ferme l'assistant (`"j"`). Aucun par défaut. */
  shortcut?: string
}

/** Largeur à partir de laquelle la page et l'assistant tiennent côte à côte (`xl`). */
export const ASSISTANT_SIDE_BY_SIDE = "(min-width: 80rem)"

const FOCUSABLE = 'textarea, input, [contenteditable="true"], [autofocus]'

export function AssistantButton({
  assistant,
  panelId,
  buttonRef,
}: {
  assistant: AppShellAssistant
  panelId: string
  buttonRef: React.RefObject<HTMLButtonElement | null>
}): React.JSX.Element {
  const label = assistant.label ?? "Assistant"
  const letter = assistant.shortcut?.toUpperCase()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={buttonRef}
            type="button"
            data-slot="app-shell-assistant-button"
            aria-expanded={assistant.open}
            aria-controls={panelId}
            {...(letter ? { "aria-keyshortcuts": `Control+${letter} Meta+${letter}` } : {})}
            onClick={() => assistant.onOpenChange(!assistant.open)}
            className={cn(
              "touch-target flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none",
              "transition-colors duration-(--duration-fast) ease-out hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              "aria-expanded:bg-foreground/[0.08] aria-expanded:text-foreground",
              "max-lg:w-9 max-lg:justify-center max-lg:px-0",
            )}
          />
        }
      >
        <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} aria-hidden className="size-[1.125rem] shrink-0" />
        <span className="max-lg:sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-2">
          {assistant.open ? `Fermer ${label.toLocaleLowerCase("fr-CH")}` : label}
          {letter ? (
            <KbdGroup>
              <Kbd>{isApplePlatform() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>{letter}</Kbd>
            </KbdGroup>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/** `Ctrl` (`⌘`) + la lettre de l'assistant : l'ouvre ou le ferme, où que soit le focus. */
export function useAssistantShortcut(assistant: AppShellAssistant | undefined): void {
  const latest = useRef(assistant)
  useEffect(() => {
    latest.current = assistant
  })
  const letter = assistant?.shortcut?.toLowerCase()
  useEffect(() => {
    if (!letter) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== letter || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return
      const current = latest.current
      if (!current) return
      event.preventDefault()
      current.onOpenChange(!current.open)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [letter])
}

export function AssistantPanel({
  assistant,
  panelId,
  wide,
  openAtShellMount,
  buttonRef,
}: {
  assistant: AppShellAssistant
  panelId: string
  wide: boolean
  openAtShellMount: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
}): React.JSX.Element {
  const { open, onOpenChange } = assistant
  const label = assistant.label ?? "Assistant"
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  // Ouvert dès le premier rendu de la coque (état restauré) : le focus reste où le navigateur le met.
  const wasOpen = useRef(openAtShellMount)

  // Ouvert : le focus entre dans le panneau (sa saisie, sinon le panneau). Fermé : il revient au
  // bouton, s'il était dans le panneau ou perdu sur la page.
  useEffect(() => {
    const panel = panelRef.current
    if (open && !wasOpen.current && panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel
      target.focus({ preventScroll: true })
    }
    if (!open && wasOpen.current) {
      const active = document.activeElement
      if (!active || active === document.body || panel?.contains(active)) buttonRef.current?.focus()
    }
    wasOpen.current = open
  }, [open, buttonRef])

  // Échap, le focus dans le panneau : il se ferme (sauf si un élément du panneau l'a déjà traité).
  useEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      onOpenChange(false)
    }
    panel.addEventListener("keydown", onKey)
    return () => panel.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const close = () => onOpenChange(false)
  return (
    <section
      ref={panelRef}
      id={panelId}
      tabIndex={-1}
      data-slot="app-shell-assistant"
      data-open={open ? "" : undefined}
      aria-labelledby={titleId}
      inert={!open || undefined}
      {...(open && !wide ? { role: "dialog", "aria-modal": true } : {})}
      className={cn(
        "outline-none",
        // Vue dédiée, sous 1280 px : plein écran, la page reste montée dessous.
        "hidden data-open:max-xl:fixed data-open:max-xl:inset-0 data-open:max-xl:z-40 data-open:max-xl:flex data-open:max-xl:flex-col data-open:max-xl:bg-background",
        "data-open:max-xl:pt-[env(safe-area-inset-top,0px)] data-open:max-xl:soft-in motion-reduce:animate-none",
        // Côte à côte : une colonne de la grille, qui s'ouvre en largeur ; la page se réorganise.
        "xl:invisible xl:flex xl:w-0 xl:flex-col xl:overflow-hidden xl:transition-[width,visibility] xl:duration-(--duration-slow) xl:ease-ios motion-reduce:transition-none",
        "xl:data-open:visible xl:data-open:w-[26rem] 2xl:data-open:w-[28rem]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col xl:w-[26rem] xl:py-2 xl:pr-2 2xl:w-[28rem]">
        <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-foreground/5 px-2 sm:px-4 xl:border-0 xl:pr-1 xl:pl-3">
          <button
            type="button"
            onClick={close}
            className="touch-target flex h-9 shrink-0 items-center gap-1.5 rounded-xl pr-3 pl-2 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 xl:hidden"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden className="size-4" />
            Retour à la page
          </button>
          <h2
            id={titleId}
            className="flex min-w-0 flex-1 items-center gap-2 truncate font-heading text-[0.9375rem] font-semibold max-xl:justify-end max-xl:pr-2"
          >
            <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} aria-hidden className="size-[1.125rem] shrink-0" />
            {label}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={`Fermer ${label.toLocaleLowerCase("fr-CH")}`}
            className="touch-target grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-shell-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-xl:hidden"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} aria-hidden className="size-[1.125rem]" />
          </button>
        </div>
        <div data-slot="app-shell-assistant-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {assistant.panel}
        </div>
      </div>
    </section>
  )
}
