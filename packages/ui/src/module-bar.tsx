import Add01Icon from "@hugeicons/core-free-icons/Add01Icon"
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import ArrowUp01Icon from "@hugeicons/core-free-icons/ArrowUp01Icon"
import DragDropVerticalIcon from "@hugeicons/core-free-icons/DragDropVerticalIcon"
import Edit02Icon from "@hugeicons/core-free-icons/Edit02Icon"
import MinusSignIcon from "@hugeicons/core-free-icons/MinusSignIcon"
import UserGroupIcon from "@hugeicons/core-free-icons/UserGroupIcon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { useState, useSyncExternalStore, type ReactNode } from "react"

import { Button } from "./button.tsx"
import { cn } from "./cn.ts"
import type { FamilyProduct } from "./family-svg.ts"
import { saveModuleBar, useModuleBar } from "./module-bar-store.ts"
import { pushModuleBar } from "./product-bar.ts"
import { hiddenModules, moduleByWord, moveModule, shownModules, type ModuleWord } from "./modules.ts"
import { ProductBadge } from "./product-badge.tsx"
import { PRODUCT_PRERENDER_ATTRIBUTE } from "./product-switch.ts"
import { shellProductEntries, type ShellProductEntry } from "./products.ts"
import { familyProductName } from "./product-name.ts"
import { lastOrganization } from "./shell-memory.ts"
import { useLeaveOnClick } from "./shell-placement.ts"
import { SIDEBAR_ITEM, SidebarNavBack } from "./sidebar-nav.tsx"
import { useSidebarRail } from "./sidebar-rail.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"

const noSubscription = () => () => {}

/** `location.origin` après l'hydratation, `undefined` au rendu serveur (liens absolus d'abord). */
function usePageOrigin(): string | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => undefined,
  )
}

/** Dernière organisation ouverte après l'hydratation, `null` au rendu serveur (lien vers l'accueil d'abord). */
function useLastOrganization(): string | null {
  return useSyncExternalStore(noSubscription, lastOrganization, () => null)
}

/** Ce que montre le milieu de la barre : les onglets du module ouvert, la liste des modules, ou son réglage. */
export type ShellNavLevel = "tabs" | "modules" | "edit"

const GROUP_LABEL = "px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground lg:text-shell-muted lg:rail:sr-only"

function ShellEntryLink({
  entry,
  icon,
  onOpenCurrent,
}: {
  entry: ShellProductEntry
  /** Pictogramme du lien à la place de la pastille du produit. */
  icon?: IconSvgElement
  /** Clic sur le module déjà ouvert : ses onglets reviennent, sans rien recharger. */
  onOpenCurrent?: () => void
}): React.JSX.Element {
  const rail = useSidebarRail()
  const leaveOnClick = useLeaveOnClick()
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    if (entry.current && onOpenCurrent && plain) {
      event.preventDefault()
      onOpenCurrent()
      return
    }
    leaveOnClick(event)
  }
  return (
    <li>
      <Tooltip disabled={!rail}>
        <TooltipTrigger
          render={
            <a
              href={entry.href}
              onClick={onClick}
              {...(entry.sameOrigin ? { [PRODUCT_PRERENDER_ATTRIBUTE]: "" } : {})}
              aria-current={entry.current ? "page" : undefined}
              className={SIDEBAR_ITEM}
            />
          }
        >
          {icon ? (
            <HugeiconsIcon icon={icon} strokeWidth={1.8} aria-hidden className="size-5 shrink-0 lg:size-[1.125rem]" />
          ) : (
            <ProductBadge product={entry.badge} className="size-5 shrink-0 lg:size-[1.125rem]" />
          )}
          <span className="min-w-0 flex-1 truncate lg:rail:sr-only">{entry.name}</span>
          {entry.hint ? <span className="text-xs font-normal lg:rail:hidden">{entry.hint}</span> : null}
        </TooltipTrigger>
        <TooltipContent side="right">{entry.name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

function ModuleList({
  entries,
  order,
  onOpenCurrent,
  onCustomize,
}: {
  entries: ReadonlyArray<ShellProductEntry>
  order: ReadonlyArray<ModuleWord>
  onOpenCurrent: () => void
  onCustomize: () => void
}): React.JSX.Element {
  const shown = order.flatMap((word) => {
    const entry = entries.find((item) => item.badge === word)
    return entry ? [entry] : []
  })
  return (
    <nav data-slot="shell-modules" aria-label="Modules" className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
      <p className={GROUP_LABEL}>Modules du projet</p>
      <ul className="grid gap-0.5">
        {shown.map((entry) => (
          <ShellEntryLink key={entry.badge} entry={entry} onOpenCurrent={onOpenCurrent} />
        ))}
      </ul>
      <button
        type="button"
        onClick={onCustomize}
        className={cn(SIDEBAR_ITEM, "mt-1 w-full text-left font-normal lg:rail:hidden")}
      >
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} aria-hidden className="size-5 shrink-0 lg:size-[1.125rem]" />
        <span className="truncate">Personnaliser la barre</span>
      </button>
    </nav>
  )
}

/** Petit bouton d'une ligne du réglage : 44 px au doigt (`touch-target`), 24 px à la souris. */
function RowButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: IconSvgElement
  label: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="touch-target grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30 lg:text-shell-muted lg:hover:bg-shell-active lg:hover:text-shell-foreground"
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden className="size-3.5" />
    </button>
  )
}

/**
 * Le réglage de la barre : un brouillon montré tel quel, gardé seulement par « Valider ». Glisser à
 * la souris ; les flèches servent au clavier et au doigt, le glisser natif n'y fonctionne pas.
 */
function ModuleBarEditor({
  order,
  onSave,
  onCancel,
}: {
  order: ReadonlyArray<ModuleWord>
  onSave: (next: ReadonlyArray<ModuleWord>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<ReadonlyArray<ModuleWord>>(order)
  const [dragged, setDragged] = useState<number | null>(null)
  const hidden = hiddenModules(draft)
  return (
    <div
      data-slot="shell-modules-editor"
      role="group"
      aria-label="Personnaliser la barre"
      className="min-h-0 flex-1 overflow-y-auto px-3 pb-2"
    >
      <p className={GROUP_LABEL}>Dans la barre</p>
      <ul className="grid gap-0.5">
        {draft.map((word, index) => {
          const { name } = moduleByWord(word)
          return (
            // Le glisser est un confort à la souris : clavier et doigt ont les boutons Monter et Descendre.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <li
              key={word}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                setDragged(index)
              }}
              onDragOver={(event) => {
                if (dragged !== null) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragged !== null) setDraft(moveModule(draft, dragged, index))
                setDragged(null)
              }}
              onDragEnd={() => setDragged(null)}
              className="flex min-h-11 cursor-grab items-center gap-1 rounded-xl bg-muted/70 pr-1 pl-1.5 text-sm font-medium lg:min-h-9 lg:bg-shell-hover coarse:min-h-11"
            >
              <HugeiconsIcon
                icon={DragDropVerticalIcon}
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground lg:text-shell-muted"
              />
              <ProductBadge product={word} className="size-[1.125rem] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <RowButton
                icon={ArrowUp01Icon}
                label={`Monter ${name}`}
                disabled={index === 0}
                onClick={() => setDraft(moveModule(draft, index, index - 1))}
              />
              <RowButton
                icon={ArrowDown01Icon}
                label={`Descendre ${name}`}
                disabled={index === draft.length - 1}
                onClick={() => setDraft(moveModule(draft, index, index + 1))}
              />
              <RowButton
                icon={MinusSignIcon}
                label={`Masquer ${name}`}
                onClick={() => setDraft(draft.filter((other) => other !== word))}
              />
            </li>
          )
        })}
      </ul>
      <p className={GROUP_LABEL}>Masqués</p>
      {hidden.length ? (
        <ul className="grid gap-0.5">
          {hidden.map(({ word, name, purpose }) => (
            <li
              key={word}
              className="flex min-h-11 items-center gap-2.5 rounded-xl pr-1 pl-3 text-sm font-medium lg:min-h-9 coarse:min-h-11"
            >
              <ProductBadge product={word} className="size-[1.125rem] shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 py-1">
                <span className="block truncate">{name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground lg:text-shell-muted">
                  {purpose}
                </span>
              </span>
              <RowButton icon={Add01Icon} label={`Ajouter ${name}`} onClick={() => setDraft([...draft, word])} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-1 text-xs text-muted-foreground lg:text-shell-muted">
          Tous les modules sont dans la barre.
        </p>
      )}
      <div className="flex gap-2 px-1 pt-3">
        <Button size="sm" onClick={() => onSave(draft)}>
          Valider
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  )
}

/**
 * Le milieu de la barre de Basalte : Manager, un trait, puis l'un des trois niveaux. Dans un module,
 * ses onglets (`nav`) sous « Retour aux modules » ; un clic y affiche la liste sans rien recharger ;
 * un clic sur un autre module ouvre sa console, préchargée au survol sous la même origine.
 */
export function ShellNavigation({
  product,
  nav,
  accountHref,
  level,
  onLevelChange,
  projectModules,
}: {
  product: FamilyProduct
  nav: ReactNode
  accountHref?: string | undefined
  level: ShellNavLevel
  onLevelChange: (level: ShellNavLevel) => void
  /** Modules activés sur le projet choisi : la liste s'y limite. Absent : tous les projets. */
  projectModules?: ReadonlyArray<ModuleWord> | undefined
}): React.JSX.Element {
  const pageOrigin = usePageOrigin()
  const organization = useLastOrganization()
  const order = useModuleBar()
  const { products, account } = shellProductEntries({ current: product, accountHref, pageOrigin, organization })
  return (
    <div data-slot="shell-navigation" className="flex min-h-0 flex-1 flex-col">
      <div data-slot="shell-manager" className="shrink-0 px-3 pt-1">
        <ul>
          <ShellEntryLink entry={account} icon={UserGroupIcon} />
        </ul>
        <div aria-hidden className="mx-2 mt-2 h-px bg-foreground/8" />
      </div>
      {level === "modules" ? (
        <ModuleList
          entries={products}
          order={shownModules(order, product).filter(
            (word) => !projectModules || word === product || projectModules.includes(word),
          )}
          onOpenCurrent={() => onLevelChange("tabs")}
          onCustomize={() => onLevelChange("edit")}
        />
      ) : level === "edit" ? (
        <ModuleBarEditor
          order={order}
          onSave={(next) => {
            saveModuleBar(next)
            void pushModuleBar(next)
            onLevelChange("modules")
          }}
          onCancel={() => onLevelChange("modules")}
        />
      ) : (
        <>
          <div className="shrink-0 px-3 pt-2">
            <ul>
              <SidebarNavBack
                label="Retour aux modules"
                keepMenuOpen
                render={<button type="button" className="w-full" onClick={() => onLevelChange("modules")} />}
              />
            </ul>
            <div
              data-slot="shell-module-title"
              className="flex min-h-9 items-center gap-2.5 px-3 text-sm font-semibold lg:text-shell-foreground lg:rail:hidden"
            >
              <ProductBadge product={product} className="size-[1.125rem] shrink-0" />
              <span className="truncate font-heading">{familyProductName(product)}</span>
            </div>
          </div>
          {nav}
        </>
      )}
    </div>
  )
}
