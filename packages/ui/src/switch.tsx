import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "./cn.ts"

/**
 * Interrupteur — la forme qu'a un réglage qu'on allume et qu'on éteint.
 *
 * Il remplace le couple « phrase qui décrit l'état + bouton qui le change ».
 * Ces deux-là disaient la même chose deux fois — « Notifications activées »
 * au-dessus de « Désactiver » — et l'un des deux mentait toujours au premier
 * coup d'œil, puisqu'un bouton porte l'action et la phrase porte l'état.
 *
 * Une pastille de texte avait d'abord pris leur place ; elle disait bien l'état
 * mais ne se lisait pas comme un contrôle. L'interrupteur, lui, n'a pas besoin
 * d'être expliqué : sa forme est son mode d'emploi.
 *
 * Dimensions calées sur iOS — 51 × 31 points, soit 3,25 × 2 rem — pour que le
 * pouce le trouve sans viser.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: SwitchPrimitive.Root.Props): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full p-0.5",
        "transition-colors duration-200 ease-ios",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2",
        "focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "bg-muted data-checked:bg-status-active",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "size-7 rounded-full bg-background shadow-sm ring-1 ring-foreground/5",
          // `translate` et non `left` : la position part sur le compositeur,
          // le pouce ne voit donc pas la bascule sautiller quand la page est
          // occupée ailleurs.
          "transition-transform duration-200 ease-ios",
          "translate-x-0 data-checked:translate-x-5",
        )}
      />
    </SwitchPrimitive.Root>
  )
}
