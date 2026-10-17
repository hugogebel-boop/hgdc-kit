import { Select as SelectPrimitive } from "@base-ui/react/select"
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { useFieldDescribedBy } from "./field.tsx"
import {
  FLOATING_COLLISION_AVOIDANCE,
  FLOATING_COLLISION_PADDING,
  FLOATING_MAX_WIDTH,
  FLOATING_SURFACE,
} from "./floating.ts"
import { cn } from "./cn.ts"

/**
 * Base UI Select wrapper. Replaces the previous native <select> wrapper so
 * the dropdown is consistent across platforms (desktop + Android Chrome get
 * the custom popover).
 *
 * iOS compris : la molette du système a été retirée (ADR 0045, révision du
 * 2026-09-23), le menu dessiné tient la DA sur tous les appareils.
 *
 * Popup DA matches DropdownMenuContent: rounded-2xl, opaque
 * `FLOATING_SURFACE`, a soft shadow and no ring.
 *
 * Typical usage:
 *
 *   <Select value={x} onValueChange={setX}>
 *     <SelectTrigger id="x"><SelectValue placeholder="–" /></SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="a">A</SelectItem>
 *     </SelectContent>
 *   </Select>
 */

// Même recette que `Input` : filet `control-off` au repos, 16 px, anneau plein
// au focus et quand le menu est ouvert.
const triggerClasses =
  "flex h-11 lg:h-10 touch-field w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-background px-3.5 text-base ring-1 ring-control-off transition-[color,box-shadow,background-color] duration-(--duration-fast) outline-none ring-inset placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/60 data-popup-open:ring-2 data-popup-open:ring-ring"

function Select<Value>(props: SelectPrimitive.Root.Props<Value>): React.JSX.Element {
  return <SelectPrimitive.Root {...props} />
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props): React.JSX.Element {
  const describedBy = useFieldDescribedBy()
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      aria-describedby={props["aria-describedby"] ?? describedBy}
      className={cn(triggerClasses, className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

type SelectValueProps = Omit<SelectPrimitive.Value.Props, "children"> & {
  /**
   * Map value → label. Lorsque fourni sans `children`, le wrapper résout
   * automatiquement le label à afficher. Évite que le SelectValue affiche
   * une valeur brute (ex: ID Convex) quand `items` du Root ne couvre pas le
   * cas ou quand la signature attendue par Base UI diffère.
   */
  items?: Record<string, React.ReactNode>
  children?: SelectPrimitive.Value.Props["children"]
}

function SelectValue({ className, items, children, ...props }: SelectValueProps): React.JSX.Element {
  const renderChildren =
    children ??
    (items
      ? (value: unknown) => {
          if (value == null || value === "") return null
          if (typeof value !== "string" && typeof value !== "number") return null
          const key = String(value)
          return items[key] ?? key
        }
      : undefined)

  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("truncate text-left data-empty:text-muted-foreground", className)}
      {...props}
    >
      {renderChildren}
    </SelectPrimitive.Value>
  )
}

function SelectContent({
  className,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">): React.JSX.Element {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={FLOATING_COLLISION_PADDING}
        collisionAvoidance={FLOATING_COLLISION_AVOIDANCE}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            FLOATING_MAX_WIDTH,
            FLOATING_SURFACE,
            // Transitions (pas de keyframes) : un open→close rapide retarget
            // depuis la position courante au lieu de rejouer l'anim entière.
            // Exit (100ms) plus court que l'enter (150ms).
            "relative z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-2xl p-1.5 transition-[scale,opacity] duration-(--duration-fast) ease-ios outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props): React.JSX.Element {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none focus:bg-muted data-highlighted:bg-muted max-lg:min-h-11 coarse:min-h-11 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex items-center justify-center">
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectGroup({ ...props }: SelectPrimitive.Group.Props): React.JSX.Element {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectGroupLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props): React.JSX.Element {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn("px-3 py-2 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return <div data-slot="select-separator" className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)} {...props} />
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectGroupLabel, SelectSeparator }
