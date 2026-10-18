import ComputerIcon from "@hugeicons/core-free-icons/ComputerIcon"
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon"
import Sun03Icon from "@hugeicons/core-free-icons/Sun03Icon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { useRef, type KeyboardEvent } from "react"

import { cn } from "./cn.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx"
import { useTheme, type Theme } from "./theme.tsx"

const CHOICES: ReadonlyArray<{ value: Theme; label: string; icon: IconSvgElement }> = [
  { value: "system", label: "Système", icon: ComputerIcon },
  { value: "light", label: "Clair", icon: Sun03Icon },
  { value: "dark", label: "Sombre", icon: Moon02Icon },
]

/**
 * Le choix du thème en trois icônes dans une pilule (Système, Clair, Sombre), à poser dans un
 * menu : chaque choix est une entrée du menu, qui ne se ferme pas. Flèches gauche et droite
 * passent d'un choix à l'autre et l'appliquent ; le thème vient de `ThemeProvider`.
 */
export function ThemeSwitch({ className }: { className?: string }): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const group = useRef<HTMLDivElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    event.stopPropagation()
    const index = CHOICES.findIndex((choice) => choice.value === theme)
    const next = CHOICES[(index + step + CHOICES.length) % CHOICES.length]
    if (!next) return
    setTheme(next.value)
    group.current?.querySelector<HTMLElement>(`[data-theme-choice="${next.value}"]`)?.focus()
  }

  const current = CHOICES.find((choice) => choice.value === theme)
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-[3px] text-sm font-medium max-lg:min-h-11 coarse:min-h-11",
        className,
      )}
    >
      <HugeiconsIcon icon={current?.icon ?? ComputerIcon} aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">Thème</span>
      <div
        ref={group}
        role="radiogroup"
        aria-label="Thème"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-fit items-center gap-0.5 rounded-full border border-border p-0.5"
      >
        {CHOICES.map(({ value, label, icon }) => {
          const active = theme === value
          return (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <MenuPrimitive.Item
                    closeOnClick={false}
                    role="radio"
                    aria-checked={active}
                    aria-label={label}
                    data-theme-choice={value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "touch-target grid size-6 cursor-default place-items-center rounded-full outline-none",
                      "transition-colors duration-(--duration-fast) ease-out focus-visible:ring-2 focus-visible:ring-ring/50",
                      active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  />
                }
              >
                <HugeiconsIcon icon={icon} aria-hidden className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
