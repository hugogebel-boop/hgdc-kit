import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "./cn.ts"

/**
 * Onglets d'une même page (Aperçu, Journal, Réglages). Flèches pour passer d'un onglet à
 * l'autre, Tab pour entrer dans le panneau. L'onglet ouvert a sa place dans l'URL quand on
 * partage la page : `value` et `onValueChange` contrôlés par le routeur, ou des liens
 * (`render={<Link to="…" />}` et `nativeButton={false}` sur `TabsTab`).
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props): React.JSX.Element {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("grid gap-6", className)} {...props} />
}

/**
 * La rangée d'onglets. L'onglet ouvert est marqué d'une pastille teintée qui glisse de l'un à
 * l'autre, monochrome comme la barre latérale : l'accent reste au focus.
 */
function TabsList({ className, children, ...props }: TabsPrimitive.List.Props): React.JSX.Element {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative z-0 flex w-fit max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none]",
        className,
      )}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className="absolute top-(--active-tab-top) left-0 -z-1 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-foreground/[0.07] transition-[translate,width] duration-(--duration-base) ease-out motion-reduce:transition-none"
      />
    </TabsPrimitive.List>
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props): React.JSX.Element {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "touch-target flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground",
        "transition-colors duration-(--duration-fast) ease-out outline-none select-none",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-active:text-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props): React.JSX.Element {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel }
