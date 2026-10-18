import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import FilterHorizontalIcon from "@hugeicons/core-free-icons/FilterHorizontalIcon"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { Button, buttonVariants } from "./button.tsx"
import { cn } from "./cn.ts"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx"
import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer.tsx"
import { Input } from "./input.tsx"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover.tsx"
import { useIsMobile } from "./use-media-query.ts"

export type FilterOption = { value: string; label: string }

export type FilterDefinition = {
  /** Nom du paramètre d'URL : `status`, `environment`. */
  key: string
  /** « Statut » */
  label: string
  options: Array<FilterOption>
  /** Une seule valeur à la fois (période, environnement). Par défaut, plusieurs. */
  single?: boolean
}

/** Valeurs choisies par filtre, telles qu'elles vivent dans l'URL : `{ status: ["error"] }`. */
export type FilterValues = Readonly<Record<string, ReadonlyArray<string> | undefined>>

/** Le texte de la pastille : « Statut », « Statut : Erreur », « Statut : Erreur +2 ». */
export function filterSummary(filter: FilterDefinition, selected: ReadonlyArray<string> = []): string {
  const labels = filter.options.filter((o) => selected.includes(o.value)).map((o) => o.label)
  const first = labels[0]
  if (first === undefined) return filter.label
  return labels.length === 1 ? `${filter.label} : ${first}` : `${filter.label} : ${first} +${labels.length - 1}`
}

/** Nombre de critères posés, recherche comprise : sert à afficher « Effacer » et l'état vide. */
export function activeFilterCount(values: FilterValues = {}, search = ""): number {
  const filters = Object.values(values).filter((v) => v !== undefined && v.length > 0).length
  return filters + (search.trim() === "" ? 0 : 1)
}

/** Ajoute ou retire une valeur d'un filtre à choix multiple, dans l'ordre des options. */
export function toggleFilterValue(
  filter: FilterDefinition,
  selected: ReadonlyArray<string> = [],
  value: string,
  checked: boolean,
): Array<string> {
  const next = new Set(selected)
  if (checked) next.add(value)
  else next.delete(value)
  return filter.options.map((o) => o.value).filter((v) => next.has(v))
}

/**
 * Recherche qui suit la saisie sans écrire dans l'URL à chaque touche : la valeur part après
 * `delay` ms de calme. Si l'URL change de son côté (retour arrière), le champ la reprend.
 */
function useDebouncedSearch(value: string, onChange: (value: string) => void, delay: number) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })
  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => latest.current(draft), delay)
    return () => clearTimeout(timer)
  }, [draft, value, delay])
  const flush = (next: string) => {
    setDraft(next)
    if (next !== value) latest.current(next)
  }
  return { draft, setDraft, flush }
}

function SearchField({
  value,
  onChange,
  placeholder = "Rechercher…",
  label = "Rechercher",
  delay = 250,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  delay?: number
  className?: string
}): React.JSX.Element {
  const { draft, setDraft, flush } = useDebouncedSearch(value, onChange, delay)
  return (
    <div className={cn("relative min-w-0 flex-1 basis-full sm:basis-56 sm:max-w-sm", className)}>
      <HugeiconsIcon
        icon={Search01Icon}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") flush(draft)
          if (event.key === "Escape" && draft !== "") {
            event.preventDefault()
            flush("")
          }
        }}
        className="h-10 pr-9 pl-10 lg:h-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {draft !== "" ? (
        <button
          type="button"
          aria-label="Vider la recherche"
          onClick={() => flush("")}
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function FilterPill({
  filter,
  selected = [],
  onChange,
}: {
  filter: FilterDefinition
  selected?: ReadonlyArray<string>
  onChange: (values: Array<string>) => void
}): React.JSX.Element {
  const active = selected.length > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="filter-pill"
        data-active={active || undefined}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "max-w-64 gap-1 pr-2.5 font-normal text-muted-foreground",
          active && "bg-foreground/[0.06] font-medium text-foreground ring-0 dark:bg-foreground/[0.08]",
        )}
      >
        <span className="truncate">{filterSummary(filter, selected)}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} aria-hidden className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto">
        {filter.single ? (
          <DropdownMenuRadioGroup
            label={filter.label}
            value={selected[0] ?? ""}
            onValueChange={(value: string) => onChange(value === "" ? [] : [value])}
          >
            <DropdownMenuRadioItem value="">Tous</DropdownMenuRadioItem>
            {filter.options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
            {filter.options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selected.includes(option.value)}
                onCheckedChange={(checked) => onChange(toggleFilterValue(filter, selected, option.value, checked))}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Nombre de filtres posés, sans la recherche : le compteur du bouton « Filtres ». */
export function activeFilterOnlyCount(values: FilterValues = {}): number {
  return activeFilterCount(values, "")
}

/** Une option du panneau : une pastille qui se coche (choix multiple) ou se choisit (choix unique). */
function OptionChip({
  label,
  checked,
  kind,
  onClick,
}: {
  label: string
  checked: boolean
  kind: "radio" | "checkbox"
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role={kind}
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "touch-target inline-flex h-9 items-center rounded-full px-3.5 text-sm outline-none transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-out focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-8 lg:px-3",
        checked
          ? "bg-foreground font-medium text-background"
          : "bg-background text-foreground ring-1 ring-border/70 ring-inset hover:bg-muted",
      )}
    >
      {label}
    </button>
  )
}

/** Un filtre du panneau : son nom, puis ses options en pastilles. */
function PanelFilter({
  filter,
  selected = [],
  onChange,
}: {
  filter: FilterDefinition
  selected?: ReadonlyArray<string>
  onChange: (values: Array<string>) => void
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="grid gap-2">
      <p id={id} className="text-xs font-medium text-muted-foreground">
        {filter.label}
      </p>
      <div role={filter.single ? "radiogroup" : "group"} aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {filter.single ? (
          <OptionChip label="Tous" kind="radio" checked={selected.length === 0} onClick={() => onChange([])} />
        ) : null}
        {filter.options.map((option) => {
          const checked = selected.includes(option.value)
          return (
            <OptionChip
              key={option.value}
              label={option.label}
              kind={filter.single ? "radio" : "checkbox"}
              checked={checked}
              onClick={() =>
                onChange(
                  filter.single
                    ? checked
                      ? []
                      : [option.value]
                    : toggleFilterValue(filter, selected, option.value, !checked),
                )
              }
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Le bouton « Filtres » et son panneau : une bulle sous le bouton sur ordinateur, une feuille du
 * bas sur téléphone. Chaque choix s'applique aussitôt ; « Réinitialiser » retire les filtres, pas
 * la recherche.
 */
function FilterPanel({
  filters,
  values,
  onFilterChange,
  onReset,
  label,
}: {
  filters: Array<FilterDefinition>
  values: FilterValues
  onFilterChange: ((key: string, values: Array<string>) => void) | undefined
  onReset: (() => void) | undefined
  label: string
}): React.JSX.Element {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const count = activeFilterOnlyCount(values)
  const trigger = (
    <button
      type="button"
      data-slot="filter-panel-trigger"
      data-active={count > 0 || undefined}
      aria-label={count > 0 ? `${label}, ${count} actif${count > 1 ? "s" : ""}` : label}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "gap-2 font-normal",
        count > 0 && "font-medium",
      )}
    />
  )
  const content = (
    <>
      {filters.map((filter) => (
        <PanelFilter
          key={filter.key}
          filter={filter}
          {...(values[filter.key] !== undefined ? { selected: values[filter.key] } : {})}
          onChange={(next) => onFilterChange?.(filter.key, next)}
        />
      ))}
    </>
  )
  const face = (
    <>
      <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} aria-hidden className="size-4" />
      <span>{label}</span>
      {count > 0 ? (
        <span
          aria-hidden
          className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-xs font-medium text-background tabular-nums"
        >
          {count}
        </span>
      ) : null}
    </>
  )
  const reset =
    onReset && count > 0 ? (
      <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
        Réinitialiser
      </Button>
    ) : null

  if (isMobile)
    return (
      <Drawer side="bottom" open={open} onOpenChange={setOpen}>
        <DrawerTrigger render={trigger}>{face}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{label}</DrawerTitle>
          </DrawerHeader>
          <DrawerCloseButton />
          <DrawerBody className="grid gap-5 pb-4">{content}</DrawerBody>
          <DrawerFooter>
            <Button onClick={() => setOpen(false)}>Voir les résultats</Button>
            {reset}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger}>{face}</PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
          <PopoverTitle>{label}</PopoverTitle>
          {reset ?? <span className="h-10 lg:h-9" aria-hidden />}
        </div>
        <div className="grid max-h-[min(28rem,70svh)] gap-4 overflow-y-auto px-4 pt-1 pb-4">{content}</div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Recherche et filtres en pastilles au-dessus d'une liste. Entièrement contrôlée, sans routeur :
 * le produit lit les valeurs dans les paramètres d'URL et les y réécrit dans les callbacks, pour
 * que le partage, le rafraîchissement et le retour arrière gardent la vue.
 *
 * La recherche n'écrit qu'après 250 ms de calme (Entrée pour tout de suite, Échap pour vider).
 * Un filtre à choix multiple reste ouvert pendant qu'on coche ; `single` en fait un choix unique
 * avec « Tous ». « Effacer » apparaît dès qu'un critère est posé.
 *
 * `variant="panel"` range les filtres derrière un seul bouton « Filtres » (icône, compteur des
 * filtres posés) qui ouvre un panneau : bulle sur ordinateur, feuille du bas sur téléphone. La
 * recherche reste visible. Pour une liste qui a plus de deux filtres, ou un en-tête déjà chargé.
 */
export function FilterBar({
  search,
  filters = [],
  values = {},
  onFilterChange,
  onReset,
  onResetFilters,
  variant = "pills",
  panelLabel = "Filtres",
  leading,
  actions,
  className,
}: {
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    /** Nom du champ pour les lecteurs d'écran, par défaut « Rechercher ». */
    label?: string
    /** Délai avant d'écrire la recherche, en millisecondes. */
    delay?: number
  }
  filters?: Array<FilterDefinition>
  values?: FilterValues
  onFilterChange?: (key: string, values: Array<string>) => void
  /** Retire tous les critères, recherche comprise. */
  onReset?: () => void
  /** `panel` : « Réinitialiser » du panneau, qui retire les filtres et garde la recherche. */
  onResetFilters?: () => void
  /** `pills` (par défaut) : une pastille par filtre. `panel` : un bouton « Filtres » et son panneau. */
  variant?: "pills" | "panel"
  /** Nom du bouton et du panneau en `panel`, « Filtres » par défaut. */
  panelLabel?: string
  /** Avant la recherche : une vue (`SegmentedControl`) qui choisit la liste plutôt que de la filtrer. */
  leading?: ReactNode
  /** À droite : la période, un bouton d'export. */
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  const count = activeFilterCount(values, search?.value)
  if (variant === "panel")
    return (
      <div role="search" data-slot="filter-bar" className={cn("flex flex-wrap items-center gap-2", className)}>
        {leading}
        {search ? <SearchField {...search} className="basis-40 sm:basis-56" /> : null}
        {filters.length ? (
          <FilterPanel
            filters={filters}
            values={values}
            onFilterChange={onFilterChange}
            onReset={onResetFilters}
            label={panelLabel}
          />
        ) : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    )
  return (
    <div role="search" data-slot="filter-bar" className={cn("flex flex-wrap items-center gap-2", className)}>
      {leading}
      {search ? <SearchField {...search} /> : null}
      {filters.map((filter) => (
        <FilterPill
          key={filter.key}
          filter={filter}
          {...(values[filter.key] !== undefined ? { selected: values[filter.key] } : {})}
          onChange={(next) => onFilterChange?.(filter.key, next)}
        />
      ))}
      {onReset && count > 0 ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
          Effacer
        </Button>
      ) : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
