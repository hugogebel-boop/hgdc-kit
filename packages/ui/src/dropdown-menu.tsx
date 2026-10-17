import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import {
  FLOATING_COLLISION_AVOIDANCE,
  FLOATING_COLLISION_PADDING,
  FLOATING_MAX_WIDTH,
  FLOATING_SUBMENU_COLLISION_AVOIDANCE,
  FLOATING_SURFACE,
} from "./floating.ts"
import { cn } from "./cn.ts"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props): React.JSX.Element {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props): React.JSX.Element {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props): React.JSX.Element {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  // Marge minimale aux bords de l'écran. Un menu ouvert depuis un élément collé
  // au bord — l'action d'un message, celle d'une ligne de tableau — s'y appuyait
  // sans respiration, quand il ne débordait pas.
  collisionPadding = FLOATING_COLLISION_PADDING,
  collisionAvoidance = FLOATING_COLLISION_AVOIDANCE,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding" | "collisionAvoidance"
  >): React.JSX.Element {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionAvoidance={collisionAvoidance}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            FLOATING_MAX_WIDTH,
            // Même surface que Select et Combobox : opaque, ombre douce,
            // pas d'anneau. Entrée en 150 ms depuis l'ancre (scale 0.98 → 1),
            // sortie en 100 ms ; des transitions, pas des keyframes, pour
            // qu'un ouvrir-fermer rapide reparte de la position courante.
            FLOATING_SURFACE,
            "relative z-50 max-h-(--available-height) w-(--anchor-width) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-2xl p-1.5 transition-[scale,opacity] duration-(--duration-fast) ease-ios outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-starting-style:scale-[0.98] data-starting-style:opacity-0 **:data-[slot$=-item]:focus:bg-muted **:data-[slot$=-item]:data-highlighted:bg-muted **:data-[slot$=-separator]:bg-foreground/5 **:data-[slot$=-trigger]:focus:bg-muted **:data-[slot$=-trigger]:aria-expanded:bg-muted! **:data-[variant=destructive]:focus:bg-destructive/10!",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props): React.JSX.Element {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}): React.JSX.Element {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn("px-3 py-2.5 text-xs text-muted-foreground data-inset:pl-9.5", className)}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}): React.JSX.Element {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium outline-hidden select-none focus:bg-muted focus:text-foreground data-inset:pl-9.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive max-lg:min-h-11 coarse:min-h-11 dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props): React.JSX.Element {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}): React.JSX.Element {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-hidden select-none focus:bg-muted focus:text-foreground data-inset:pl-9.5 max-lg:min-h-11 coarse:min-h-11 data-popup-open:bg-muted data-popup-open:text-foreground data-open:bg-muted data-open:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>): React.JSX.Element {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      collisionAvoidance={FLOATING_SUBMENU_COLLISION_AVOIDANCE}
      className={cn(
        "relative w-auto min-w-36 rounded-2xl p-1.5 **:data-[slot$=-item]:focus:bg-muted **:data-[slot$=-item]:data-highlighted:bg-muted **:data-[slot$=-separator]:bg-foreground/5 **:data-[slot$=-trigger]:focus:bg-muted **:data-[slot$=-trigger]:aria-expanded:bg-muted! **:data-[variant=destructive]:focus:bg-destructive/10!",
        className,
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}): React.JSX.Element {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none focus:bg-muted focus:text-foreground data-inset:pl-9.5 max-lg:min-h-11 coarse:min-h-11 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

/**
 * `label` titre le groupe. `Menu.RadioGroup` ne pose pas le contexte de
 * `Menu.Group` : un `DropdownMenuLabel` glissé dedans lève l'erreur Base UI
 * #31 et fait tomber le menu. Le titre passe donc par ici, jamais en enfant.
 */
function DropdownMenuRadioGroup({
  label,
  ...props
}: MenuPrimitive.RadioGroup.Props & { label?: React.ReactNode }): React.JSX.Element {
  const group = <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
  if (label === undefined) return group
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {group}
    </DropdownMenuGroup>
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}): React.JSX.Element {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none focus:bg-muted focus:text-foreground data-inset:pl-9.5 max-lg:min-h-11 coarse:min-h-11 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props): React.JSX.Element {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
