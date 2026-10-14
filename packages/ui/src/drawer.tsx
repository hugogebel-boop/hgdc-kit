import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { createContext, useContext, type HTMLAttributes } from "react"

import { useIsMobile } from "./use-media-query.ts"
import { cn } from "./cn.ts"

/**
 * Panneau glissant, sur Base UI Drawer.
 *
 * Deux placements. `bottom` : une feuille qui monte du bas et se referme au
 * doigt, pour un téléphone. `right` : un volet flottant à droite pour un écran
 * large, le « Peek » de Linear — la liste reste visible derrière, et
 * cliquable si le panneau n'est pas modal. `auto` choisit selon la largeur
 * (`lg`), au même seuil que la barre de navigation.
 *
 * Le geste vient de Base UI : pendant le glissement, le panneau suit le doigt
 * par `--drawer-swipe-movement-*` et la transition est coupée
 * (`data-swiping`) ; au lâcher, elle reprend depuis la position courante.
 * Rien ici n'est un keyframe : une ouverture interrompue se retourne sans
 * rejouer l'animation entière.
 *
 * La feuille du bas suit la recette de la démo Base UI (révision du
 * 2026-09-23) : `touch-action: none` sur la feuille, sinon le navigateur prend
 * le doigt pour un défilement natif et le glissement s'interrompt en route.
 * Une zone qui défile dedans garde son défilement : le navigateur ne combine
 * `touch-action` que jusqu'au conteneur défilant le plus proche. Un fond qui déborde sous le
 * bord (`--bleed`) évite le vide quand on tire vers le haut, la sortie dure
 * selon la vitesse du geste (`--drawer-swipe-strength`), et le clavier virtuel
 * est suivi (`VirtualKeyboardProvider`) : le champ touché reste visible.
 */

type DrawerSide = "bottom" | "right"

const DrawerSideContext = createContext<DrawerSide>("bottom")

type DrawerProps = Omit<DrawerPrimitive.Root.Props, "swipeDirection"> & {
  side?: DrawerSide | "auto"
}

function Drawer({ side = "auto", children, ...props }: DrawerProps): React.JSX.Element {
  const isMobile = useIsMobile()
  const resolved: DrawerSide = side === "auto" ? (isMobile ? "bottom" : "right") : side
  return (
    <DrawerSideContext.Provider value={resolved}>
      <DrawerPrimitive.Root swipeDirection={resolved === "bottom" ? "down" : "right"} {...props}>
        {resolved === "bottom" && typeof children !== "function" ? (
          <DrawerPrimitive.VirtualKeyboardProvider>{children}</DrawerPrimitive.VirtualKeyboardProvider>
        ) : (
          children
        )}
      </DrawerPrimitive.Root>
    </DrawerSideContext.Provider>
  )
}

const DrawerTrigger: typeof DrawerPrimitive.Trigger = DrawerPrimitive.Trigger
const DrawerClose: typeof DrawerPrimitive.Close = DrawerPrimitive.Close

const popupBase =
  "pointer-events-auto fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-2xl shadow-black/10 outline-none transition-[translate] duration-(--duration-drawer) ease-ios data-swiping:duration-0 data-swiping:select-none"

const popupBySide: Record<DrawerSide, string> = {
  bottom: cn(
    "inset-x-0 bottom-0 touch-none rounded-t-3xl",
    // Tirée vers le haut, la feuille monte au-delà de son bord : le fond qui
    // déborde (`--bleed`, compensé par la marge négative) comble le vide.
    // Le clavier ouvert (`--drawer-keyboard-inset`, posé par
    // `VirtualKeyboardProvider` sur le cadre) s'ajoute au pied : le contenu
    // reste au-dessus du clavier au lieu de passer dessous.
    "-mb-(--bleed) pb-[calc(env(safe-area-inset-bottom)+var(--bleed)+var(--drawer-keyboard-inset,0px))] [--bleed:3rem]",
    "translate-y-[calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px))]",
    "data-ending-style:translate-y-[calc(100%-var(--bleed))] data-starting-style:translate-y-[calc(100%-var(--bleed))]",
    // Lâchée d'un coup sec, elle part plus vite qu'un glissement lent.
    "data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*var(--duration-drawer))]",
  ),
  right: cn(
    "top-2 right-2 bottom-2 w-[calc(100%-1rem)] max-w-md rounded-3xl",
    // Tirer vers la gauche ne fait rien : le volet est déjà contre son bord.
    "translate-x-[max(0px,var(--drawer-swipe-movement-x,0px))]",
    "data-ending-style:translate-x-[calc(100%+0.5rem)] data-starting-style:translate-x-[calc(100%+0.5rem)]",
  ),
}

type DrawerContentProps = DrawerPrimitive.Popup.Props & {
  /**
   * Voile derrière le panneau. À couper pour un volet non modal, où la page
   * doit rester lisible et cliquable.
   */
  backdrop?: boolean
}

function DrawerContent({ className, children, backdrop = true, ...props }: DrawerContentProps): React.JSX.Element {
  const side = useDrawerSide()
  return (
    <DrawerPrimitive.Portal>
      {backdrop ? (
        // Neutre sombre dans les deux thèmes, et sans flou : le voile suit un
        // doigt à soixante images par seconde, un `backdrop-filter` ne tiendrait
        // pas la cadence sur un téléphone. Il s'éclaircit avec le glissement.
        //
        // `fixed` partout, jamais `absolute` sur iOS comme dans la démo Base UI :
        // le verrou de défilement d'iOS (`overflow: hidden`) garde la page là
        // où elle était, et un voile `absolute` restait ancré en haut du
        // document. Ouvert depuis une page défilée (les cartes des plans), il
        // laissait une bande claire en bas de l'écran. Il déborde de six rem en
        // haut et en bas pour passer sous les barres de Safari.
        <DrawerPrimitive.Backdrop className="fixed inset-x-0 -inset-y-24 z-50 bg-black/30 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-(--duration-drawer) ease-ios data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 dark:bg-black/50" />
      ) : null}
      {/* Le cadre ne prend pas les clics : sans voile, la page derrière un
          volet reste utilisable, c'est tout l'intérêt du placement `right`. */}
      <DrawerPrimitive.Viewport className="pointer-events-none fixed inset-0 z-50">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            popupBase,
            popupBySide[side],
            // La feuille prend la hauteur de son contenu, jusqu'en haut de
            // l'écran (révision du 2026-10-01) : arrêtée aux deux tiers, un
            // contenu long obligeait à défiler dedans. Clavier ouvert, elle
            // monte d'office tout en haut : le multiplicateur fait passer la
            // hauteur minimale de 0 à la hauteur maximale dès que le clavier
            // a une hauteur, sans JavaScript.
            // Tout l'écran, moins la barre d'état et un liseré qui laisse
            // deviner la page derrière. Classes écrites en entier : Tailwind
            // ne lit pas une classe composée.
            side === "bottom" &&
              "max-h-[calc(100svh-max(env(safe-area-inset-top),0.75rem)-0.5rem+var(--bleed))] min-h-[min(calc(var(--drawer-keyboard-inset,0px)*1000),calc(100svh-max(env(safe-area-inset-top),0.75rem)-0.5rem+var(--bleed)))]",
            className,
          )}
          {...props}
        >
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col">
            {side === "bottom" ? (
              <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
            ) : null}
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

function useDrawerSide(): DrawerSide {
  return useContext(DrawerSideContext)
}

/** La croix en haut à droite, même dessin que celle des boîtes de dialogue. */
function DrawerCloseButton({ className, ...props }: DrawerPrimitive.Close.Props): React.JSX.Element {
  return (
    <DrawerPrimitive.Close
      data-slot="drawer-close"
      aria-label="Fermer"
      className={cn(
        "touch-target absolute top-4 right-4 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
    </DrawerPrimitive.Close>
  )
}

function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const side = useDrawerSide()
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex shrink-0 flex-col gap-1.5 px-6 pr-14 pb-3", side === "bottom" ? "pt-3" : "pt-5", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props): React.JSX.Element {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-heading text-lg font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props): React.JSX.Element {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * La partie qui défile ; l'en-tête et le pied restent en place.
 *
 * `*:shrink-0` : posé en colonne flex (`flex flex-col`, le cas courant), un
 * corps plus haut que la feuille ne défile pas, il comprime ses enfants. Un
 * enfant `overflow-hidden` (le bandeau d'un plan) n'a plus de hauteur minimale
 * et s'écrasait en une bande de quelques pixels sur téléphone.
 */
function DrawerBody({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      data-slot="drawer-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2 *:shrink-0", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("flex shrink-0 flex-col-reverse gap-2 px-6 pt-3 pb-5 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
  useDrawerSide,
}
export type { DrawerSide }
