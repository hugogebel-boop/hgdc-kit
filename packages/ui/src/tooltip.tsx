import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { FLOATING_COLLISION_AVOIDANCE, FLOATING_COLLISION_PADDING, FLOATING_MAX_WIDTH } from "./floating.ts"
import { cn } from "./cn.ts"

/**
 * Infobulle : le nom d'un bouton-icône ou d'un raccourci, pour la souris et le clavier. Jamais
 * une information indispensable : elle n'existe pas au doigt (Base UI la coupe sur écran
 * tactile). Le déclencheur porte toujours un `aria-label` qui dit la même chose. Pour une
 * explication à lire, c'est un `Popover`.
 *
 * Un `TooltipProvider` autour de l'application : passée la première, les infobulles voisines
 * s'ouvrent aussitôt, sans animation.
 */
function TooltipProvider({ delay = 500, ...props }: TooltipPrimitive.Provider.Props): React.JSX.Element {
  return <TooltipPrimitive.Provider delay={delay} {...props} />
}

const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root
const TooltipTrigger: typeof TooltipPrimitive.Trigger = TooltipPrimitive.Trigger

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">): React.JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={FLOATING_COLLISION_PADDING}
        collisionAvoidance={FLOATING_COLLISION_AVOIDANCE}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            FLOATING_MAX_WIDTH,
            // Encre inversée : une étiquette courte, lisible sur n'importe quel fond. Elle flotte,
            // elle a donc une ombre, douce.
            "w-fit max-w-xs origin-(--transform-origin) rounded-xl bg-foreground px-2.5 py-1.5 text-xs font-medium text-balance text-background shadow-lg shadow-black/10",
            "transition-[scale,opacity] duration-(--duration-fast) ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-instant:transition-none data-starting-style:scale-[0.97] data-starting-style:opacity-0",
            "[&_kbd]:bg-background/15 [&_kbd]:text-background",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent }
