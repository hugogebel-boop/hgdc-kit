import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import ArrowDownDoubleIcon from "@hugeicons/core-free-icons/ArrowDownDoubleIcon"
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { buttonVariants } from "./button.tsx"
import { cn } from "./cn.ts"
import { useCopy } from "./copy-button.tsx"
import { Input } from "./input.tsx"

export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogLine = {
  id: string
  /** Millisecondes ou `Date`. */
  time: number | Date
  level?: LogLevel
  message: string
}

export const LOG_LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "Debug",
  info: "Info",
  warn: "Alerte",
  error: "Erreur",
}

const LEVELS: ReadonlyArray<LogLevel> = ["debug", "info", "warn", "error"]

const LEVEL_INK: Record<LogLevel, string> = {
  debug: "text-muted-foreground/70",
  info: "text-muted-foreground",
  warn: "text-status-degraded-ink",
  error: "text-destructive",
}

/** Hauteur fixe d'une ligne, en pixels : c'est elle qui permet de n'afficher que la partie visible. */
const ROW = 24
/** Lignes rendues au-delà de la partie visible, en haut et en bas, pour un défilement sans trou. */
const OVERSCAN = 20

const clock = new Intl.DateTimeFormat("fr-CH", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
})

/** Les lignes qui passent les niveaux choisis (aucun : tous) et contiennent la recherche. */
export function filterLogLines(
  lines: ReadonlyArray<LogLine>,
  { levels = [], query = "" }: { levels?: ReadonlyArray<LogLevel>; query?: string },
): ReadonlyArray<LogLine> {
  const needle = query.trim().toLocaleLowerCase("fr-CH")
  if (levels.length === 0 && needle === "") return lines
  return lines.filter(
    (line) =>
      (levels.length === 0 || (line.level !== undefined && levels.includes(line.level))) &&
      (needle === "" || line.message.toLocaleLowerCase("fr-CH").includes(needle)),
  )
}

/** Le texte copié : une ligne par entrée, heure, niveau, message. */
export function formatLogLines(
  lines: ReadonlyArray<LogLine>,
  formatTime: (time: number | Date) => string = (t) => clock.format(t),
): string {
  return lines
    .map((line) => [formatTime(line.time), line.level?.toUpperCase(), line.message].filter(Boolean).join(" "))
    .join("\n")
}

/** Les lignes à rendre pour une position de défilement : `[début, fin)`. */
export function visibleRange(scrollTop: number, viewport: number, count: number): [start: number, end: number] {
  const start = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN)
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / ROW) + OVERSCAN)
  return [start, end]
}

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const needle = query.trim().toLocaleLowerCase("fr-CH")
  if (needle === "") return text
  const parts: Array<ReactNode> = []
  const lower = text.toLocaleLowerCase("fr-CH")
  let from = 0
  let at = lower.indexOf(needle)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark key={at} className="rounded-sm bg-status-degraded/30 text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>,
    )
    from = at + needle.length
    at = lower.indexOf(needle, from)
  }
  parts.push(text.slice(from))
  return parts
}

const CHIP =
  "inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-muted-foreground outline-none transition-colors duration-(--duration-fast) ease-out select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-pressed:bg-foreground data-pressed:text-background"

/**
 * Journaux d'un déploiement, d'une fonction, d'un envoi : flux en chasse fixe, heure et niveau
 * en tête de ligne. Filtre par niveau, recherche (surlignée), copie de ce qui est affiché.
 *
 * `live` : le flux grossit encore. « Suivre » garde le bas en vue ; remonter dans le journal
 * l'arrête, « Suivre » ou le bouton du bas le reprend.
 *
 * Seules les lignes visibles sont dans la page (hauteur de ligne fixe, lignes longues défilant
 * de côté) : dix mille lignes coûtent autant que cinquante.
 */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- zone de défilement focalisable, voulu */
export function LogViewer({
  lines,
  label = "Journaux",
  live = false,
  height = 420,
  formatTime = (t) => clock.format(t),
  emptyLabel = "Aucune ligne pour l'instant.",
  className,
}: {
  lines: ReadonlyArray<LogLine>
  /** Nom du journal pour les lecteurs d'écran. */
  label?: string
  live?: boolean
  /** Hauteur de la zone des lignes, en pixels. */
  height?: number
  formatTime?: (time: number | Date) => string
  emptyLabel?: string
  className?: string
}): React.JSX.Element {
  const [query, setQuery] = useState("")
  const [levels, setLevels] = useState<Array<LogLevel>>([])
  const [follow, setFollow] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const { copied, copy } = useCopy()

  const deferredQuery = useDeferredValue(query)
  const shown = useMemo(() => filterLogLines(lines, { levels, query: deferredQuery }), [lines, levels, deferredQuery])
  const hasLevels = useMemo(() => lines.some((l) => l.level !== undefined), [lines])
  const following = live && follow
  const [start, end] = visibleRange(scrollTop, height, shown.length)

  useLayoutEffect(() => {
    const el = viewport.current
    if (!following || !el) return
    el.scrollTop = el.scrollHeight
  }, [following, shown])

  function onScroll() {
    const el = viewport.current
    if (!el) return
    setScrollTop(el.scrollTop)
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= ROW
    if (live && follow && !atBottom) setFollow(false)
  }

  return (
    <div data-slot="log-viewer" className={cn("surface flex min-w-0 flex-col overflow-hidden rounded-3xl", className)}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Input
          type="search"
          aria-label="Rechercher dans les journaux"
          placeholder="Rechercher…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 min-w-0 flex-1 basis-full sm:max-w-xs sm:basis-48 lg:h-9"
        />
        {hasLevels ? (
          <ToggleGroup
            multiple
            aria-label="Niveaux"
            value={levels}
            onValueChange={(value) => setLevels(LEVELS.filter((l) => value.includes(l)))}
            className="flex items-center gap-1"
          >
            {LEVELS.map((level) => (
              <Toggle key={level} value={level} className={CHIP}>
                {LOG_LEVEL_LABEL[level]}
              </Toggle>
            ))}
          </ToggleGroup>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {live ? (
            <Toggle pressed={follow} onPressedChange={setFollow} className={CHIP}>
              Suivre
            </Toggle>
          ) : null}
          <button
            type="button"
            aria-label={copied ? "Copié" : "Copier les lignes affichées"}
            title={copied ? "Copié" : "Copier les lignes affichées"}
            disabled={shown.length === 0}
            onClick={() => void copy(formatLogLines(shown, formatTime))}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
          >
            <HugeiconsIcon
              key={copied ? "ok" : "copy"}
              icon={copied ? Tick02Icon : Copy01Icon}
              strokeWidth={2}
              aria-hidden
              className="size-4 pop-in"
            />
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Le défilement est un arrêt de tabulation : les flèches y font défiler, au clavier aussi
            (règle axe « scrollable-region-focusable »). */}
        <div
          ref={viewport}
          role="log"
          aria-label={label}
          aria-live="off"
          tabIndex={0}
          onScroll={onScroll}
          style={{ height }}
          className="overflow-auto border-t border-foreground/5 py-2 font-mono text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          {shown.length === 0 ? (
            <p className="px-4 font-sans text-sm text-muted-foreground">
              {lines.length === 0 ? emptyLabel : "Aucune ligne ne correspond."}
            </p>
          ) : (
            <div style={{ height: shown.length * ROW }} className="relative w-max min-w-full">
              <div style={{ transform: `translateY(${start * ROW}px)` }}>
                {shown.slice(start, end).map((line) => (
                  <div
                    key={line.id}
                    data-slot="log-line"
                    data-level={line.level}
                    style={{ height: ROW }}
                    className={cn(
                      "flex gap-3 px-4 whitespace-pre hover:bg-foreground/[0.03]",
                      line.level === "error" && "bg-destructive/[0.05]",
                    )}
                  >
                    <time className="shrink-0 text-muted-foreground tabular-nums select-none">
                      {formatTime(line.time)}
                    </time>
                    {hasLevels ? (
                      <span className={cn("w-14 shrink-0 uppercase", line.level && LEVEL_INK[line.level])}>
                        {line.level ? LOG_LEVEL_LABEL[line.level] : ""}
                      </span>
                    ) : null}
                    <span>
                      <Highlight text={line.message} query={deferredQuery} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {live && !follow ? (
          <button
            type="button"
            onClick={() => setFollow(true)}
            className={cn(
              buttonVariants({ variant: "secondary", size: "xs" }),
              "absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg shadow-black/10",
            )}
          >
            <HugeiconsIcon icon={ArrowDownDoubleIcon} strokeWidth={2} aria-hidden />
            Revenir en bas
          </button>
        ) : null}
      </div>
      {/* Annoncé quand un filtre change, pas à chaque ligne du flux. */}
      <p className="sr-only" aria-live="polite">
        {deferredQuery.trim() !== "" || levels.length > 0 ? `${shown.length} lignes sur ${lines.length}` : ""}
      </p>
    </div>
  )
}
/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */
