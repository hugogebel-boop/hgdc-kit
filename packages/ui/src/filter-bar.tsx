import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

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
import { Input } from "./input.tsx"

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
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  delay?: number
}): React.JSX.Element {
  const { draft, setDraft, flush } = useDebouncedSearch(value, onChange, delay)
  return (
    <div className="relative min-w-0 flex-1 basis-full sm:basis-56 sm:max-w-sm">
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

/**
 * Recherche et filtres en pastilles au-dessus d'une liste. Entièrement contrôlée, sans routeur :
 * le produit lit les valeurs dans les paramètres d'URL et les y réécrit dans les callbacks, pour
 * que le partage, le rafraîchissement et le retour arrière gardent la vue.
 *
 * La recherche n'écrit qu'après 250 ms de calme (Entrée pour tout de suite, Échap pour vider).
 * Un filtre à choix multiple reste ouvert pendant qu'on coche ; `single` en fait un choix unique
 * avec « Tous ». « Effacer » apparaît dès qu'un critère est posé.
 */
export function FilterBar({
  search,
  filters = [],
  values = {},
  onFilterChange,
  onReset,
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
  /** À droite : la période, un bouton d'export. */
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  const count = activeFilterCount(values, search?.value)
  return (
    <div role="search" data-slot="filter-bar" className={cn("flex flex-wrap items-center gap-2", className)}>
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
