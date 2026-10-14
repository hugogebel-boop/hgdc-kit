import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import {
  FLOATING_COLLISION_AVOIDANCE,
  FLOATING_COLLISION_PADDING,
  FLOATING_MAX_WIDTH,
  FLOATING_SURFACE,
} from "./floating.ts"
import { cn } from "./cn.ts"

/**
 * Bulle ouverte par un clic : une explication (« Qu'est-ce qu'un domaine vérifié ? »), un petit
 * formulaire, un filtre. Elle garde le focus, se ferme par Échap ou un clic à côté, et rend le
 * focus à son déclencheur. Même surface que les menus (`floating.ts`).
 */
const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root
const PopoverTrigger: typeof PopoverPrimitive.Trigger = PopoverPrimitive.Trigger
const PopoverClose: typeof PopoverPrimitive.Close = PopoverPrimitive.Close

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "side" | "sideOffset" | "align">): React.JSX.Element {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="isolate z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={FLOATING_COLLISION_PADDING}
        collisionAvoidance={FLOATING_COLLISION_AVOIDANCE}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            FLOATING_MAX_WIDTH,
            FLOATING_SURFACE,
            "grid w-72 origin-(--transform-origin) gap-2 rounded-2xl p-4 text-sm outline-none",
            "transition-[scale,opacity] duration-(--duration-fast) ease-ios data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props): React.JSX.Element {
  return <PopoverPrimitive.Title data-slot="popover-title" className={cn("font-medium", className)} {...props} />
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props): React.JSX.Element {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Popover, PopoverTrigger, PopoverClose, PopoverContent, PopoverTitle, PopoverDescription }
