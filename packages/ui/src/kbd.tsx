import { cn } from "./cn.ts"

/**
 * Une touche de clavier : `<Kbd>Ctrl</Kbd><Kbd>K</Kbd>`. Teinte discrète, chiffres et lettres en
 * largeur fixe. Dans une infobulle, elle prend l'encre inversée.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">): React.JSX.Element {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-foreground/[0.07] px-1 font-sans text-[11px] font-medium text-muted-foreground tabular-nums select-none",
        className,
      )}
      {...props}
    />
  )
}

/** Plusieurs touches d'un même raccourci, espacées et lues comme un groupe. */
export function KbdGroup({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />
}

/** « ⌘ » sur Mac, « Ctrl » ailleurs. `false` au rendu serveur, puis corrigé au montage. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}
