import { useEffect, useState } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { cn } from "./cn.ts"

const LOCALE = "fr-CH"
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "short" })
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" })
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" })
const full = new Intl.DateTimeFormat(LOCALE, { dateStyle: "full", timeStyle: "medium" })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * « à l'instant », « il y a 3 min », « il y a 2 h », « hier », « il y a 4 j », puis la date
 * (« 3 oct. », avec l'année si ce n'est pas celle de `now`). Le futur se dit « dans 5 min ».
 */
export function formatRelative(date: number | Date, now: number = Date.now()): string {
  const ms = typeof date === "number" ? date : date.getTime()
  const diff = ms - now
  const abs = Math.abs(diff)
  if (abs < 45_000) return "à l'instant"
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), "minute")
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), "hour")
  if (abs < 7 * DAY) return relative.format(Math.round(diff / DAY), "day")
  const d = new Date(ms)
  return new Date(now).getFullYear() === d.getFullYear() ? dayMonth.format(d) : dayMonthYear.format(d)
}

/** Date complète, pour l'infobulle : « jeudi 15 octobre 2026 à 14:32:05 ». */
export function formatFullDate(date: number | Date): string {
  return full.format(typeof date === "number" ? new Date(date) : date)
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}

/**
 * Une date relative qui se met à jour seule (toutes les 30 s), la date exacte au survol.
 * `now` fixe l'instant de référence (tests, listes qui partagent une horloge).
 */
export function RelativeTime({
  date,
  now,
  className,
}: {
  date: number | Date
  now?: number
  className?: string
}): React.JSX.Element {
  const ticking = useNow(now === undefined)
  const ms = typeof date === "number" ? date : date.getTime()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={new Date(ms).toISOString()}
            suppressHydrationWarning
            className={cn("tabular-nums", className)}
          />
        }
      >
        {formatRelative(ms, now ?? ticking)}
      </TooltipTrigger>
      <TooltipContent>{formatFullDate(ms)}</TooltipContent>
    </Tooltip>
  )
}
