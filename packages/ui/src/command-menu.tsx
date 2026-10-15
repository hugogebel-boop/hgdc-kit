import { Autocomplete } from "@base-ui/react/autocomplete"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import type { FamilyProduct } from "./family-svg.ts"
import { FLOATING_SURFACE } from "./floating.ts"
import { ProductBadge } from "./product-badge.tsx"
import { Kbd, KbdGroup, isApplePlatform } from "./kbd.tsx"
import { cn } from "./cn.ts"

export type Command = {
  /** Unique dans toute la palette. */
  id: string
  label: string
  icon?: IconSvgElement
  /** Pastille d'un produit (« Ouvrir HGDC Mail »), à la place de `icon`. */
  badge?: FamilyProduct
  /** Autres mots qui trouvent la commande : « dns » pour « Ajouter un domaine ». */
  keywords?: Array<string>
  /** Texte discret à droite : l'organisation d'un projet, « Page ». */
  hint?: string
  /** Touches affichées à droite, par exemple `["G", "P"]`. */
  shortcut?: Array<string>
  onSelect: () => void
}

/** Les groupes de la famille, dans cet ordre : « Aller à », « Créer », « Changer ». */
export type CommandGroup = { label: string; items: Array<Command> }

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/**
 * Une commande répond à la recherche si chaque mot tapé figure dans son libellé ou ses mots-clés,
 * sans tenir compte des accents ni de la casse : « creer dom » trouve « Créer un domaine ».
 */
export function matchCommand(command: Pick<Command, "label" | "keywords">, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalize([command.label, ...(command.keywords ?? [])].join(" "))
  return words.every((word) => haystack.includes(word))
}

/**
 * `Ctrl+K` (`⌘K` sur Mac) partout, même dans un champ : c'est le geste qui ouvre tout. Le produit
 * le pose une fois, autour de sa coque.
 */
export function useCommandMenuShortcut(onToggle: () => void, key = "k"): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      onToggle()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onToggle, key])
}

/**
 * Palette de commandes : chercher une page, créer une ressource, changer d'organisation ou de
 * thème, sans la souris. Bâtie sur l'`Autocomplete` de Base UI rendu dans un `Dialog`, comme
 * l'exemple « Command palette » de sa documentation : flèches pour choisir, Entrée pour lancer,
 * Échap pour fermer, focus rendu à l'élément d'origine.
 *
 * Sans animation, ni à l'ouverture ni à la fermeture : elle s'ouvre des dizaines de fois par
 * jour, au clavier, et doit être là à l'instant où la touche est pressée.
 */
export function CommandMenu({
  groups,
  open: openProp,
  onOpenChange,
  placeholder = "Rechercher une page, une action…",
  emptyLabel = "Aucune commande ne correspond.",
  shortcut = true,
}: {
  groups: Array<CommandGroup>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  emptyLabel?: string
  /** Ouvrir et fermer par `Ctrl+K`. `false` si le produit gère le raccourci lui-même. */
  shortcut?: boolean
}): React.JSX.Element {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )
  const toggle = useCallback(() => setOpen(!open), [open, setOpen])
  useCommandMenuShortcut(shortcut ? toggle : noop)

  const visibleGroups = groups.filter((group) => group.items.length > 0)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/30 dark:bg-black/60" />
        <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-start justify-center px-2 pt-[min(12dvh,6rem)] pb-2">
          <DialogPrimitive.Popup
            data-slot="command-menu"
            aria-label="Palette de commandes"
            className={cn(
              FLOATING_SURFACE,
              "flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/10 outline-none",
            )}
          >
            <Autocomplete.Root
              open
              inline
              items={visibleGroups}
              itemToStringValue={(command: Command) => command.label}
              filter={(command: Command, query: string) => matchCommand(command, query)}
              autoHighlight="always"
              keepHighlight
            >
              <Autocomplete.InputGroup className="flex items-center gap-3 border-b border-foreground/5 px-4">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={2}
                  aria-hidden
                  className="size-4.5 shrink-0 text-muted-foreground"
                />
                <Autocomplete.Input
                  aria-label="Rechercher une commande"
                  placeholder={placeholder}
                  className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
                <DialogPrimitive.Close className="sr-only">Fermer la palette</DialogPrimitive.Close>
              </Autocomplete.InputGroup>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scroll-padding-block:0.375rem]">
                <Autocomplete.Empty className="px-3 py-10 text-center text-sm text-muted-foreground empty:hidden">
                  {emptyLabel}
                </Autocomplete.Empty>
                <Autocomplete.List>
                  {(group: CommandGroup) => (
                    <Autocomplete.Group key={group.label} items={group.items} className="not-last:mb-1.5">
                      <Autocomplete.GroupLabel className="px-3 pt-2 pb-1.5 text-xs font-medium text-muted-foreground">
                        {group.label}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(command: Command) => (
                          <Autocomplete.Item
                            key={command.id}
                            value={command}
                            onClick={() => {
                              setOpen(false)
                              command.onSelect()
                            }}
                            className="flex min-h-11 cursor-default items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium outline-none select-none data-highlighted:bg-muted lg:min-h-10"
                          >
                            {command.badge ? (
                              <ProductBadge product={command.badge} className="size-4.5" />
                            ) : command.icon ? (
                              <HugeiconsIcon
                                icon={command.icon}
                                strokeWidth={1.8}
                                aria-hidden
                                className="size-4.5 shrink-0 text-muted-foreground"
                              />
                            ) : null}
                            <span className="min-w-0 flex-1 truncate">{command.label}</span>
                            {command.hint ? (
                              <span className="shrink-0 truncate text-xs font-normal text-muted-foreground">
                                {command.hint}
                              </span>
                            ) : null}
                            {command.shortcut ? (
                              <KbdGroup className="hidden shrink-0 sm:inline-flex">
                                {command.shortcut.map((key) => (
                                  <Kbd key={key}>{key}</Kbd>
                                ))}
                              </KbdGroup>
                            ) : null}
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>

              <div className="hidden items-center gap-4 border-t border-foreground/5 px-4 py-2.5 text-xs text-muted-foreground sm:flex">
                <span className="flex items-center gap-1.5">
                  <KbdGroup>
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                  </KbdGroup>
                  Choisir
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>Entrée</Kbd>
                  Ouvrir
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>Échap</Kbd>
                  Fermer
                </span>
              </div>
            </Autocomplete.Root>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function noop(): void {}

function subscribeNever(): () => void {
  return noop
}

const COMPACT = "w-9 max-w-none justify-center px-0"

/**
 * Le bouton qui ouvre la palette, pour la souris et le doigt : « Rechercher » et le raccourci.
 * Dans la barre latérale ou l'en-tête. `compact` : la loupe seule, dans un carré de 36 px, le
 * libellé devenant le nom accessible ; `"mobile"` ne compacte que sous `lg`, sans JavaScript.
 */
export function CommandMenuButton({
  onClick,
  label = "Rechercher",
  compact = false,
  className,
}: {
  onClick: () => void
  label?: string
  compact?: boolean | "mobile"
  className?: string
}): React.JSX.Element {
  const apple = useSyncExternalStore(subscribeNever, isApplePlatform, () => false)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-keyshortcuts="Control+K Meta+K"
      {...(compact === true ? { "aria-label": label, title: label } : {})}
      data-compact={compact === false ? undefined : String(compact)}
      className={cn(
        "touch-target flex h-9 w-full max-w-sm min-w-0 items-center gap-2 rounded-xl bg-foreground/[0.05] px-3 text-sm text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        compact === true && COMPACT,
        compact === "mobile" && "max-lg:w-9 max-lg:max-w-none max-lg:justify-center max-lg:px-0",
        className,
      )}
    >
      <HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden className="size-4 shrink-0" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          compact === true && "sr-only",
          compact === "mobile" && "max-lg:sr-only",
        )}
      >
        {label}
      </span>
      <KbdGroup aria-hidden className={cn("max-lg:hidden", compact === true && "hidden")}>
        <Kbd>{apple ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </button>
  )
}
