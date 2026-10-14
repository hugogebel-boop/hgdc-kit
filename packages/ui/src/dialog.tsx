import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import type { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { Drawer, DrawerCloseButton, DrawerContent } from "./drawer.tsx"
import { useIsMobile } from "./use-media-query.ts"
import { cn } from "./cn.ts"

// La boîte est pleine et nette : c'est le fond qui est assombri et flouté,
// pas elle. Translucide et floutée elle-même, elle laissait transparaître le
// contenu qu'elle recouvrait — on lisait deux plans à la fois là où l'on
// cherchait justement à n'en montrer qu'un. Sur iPhone en app installée, ce
// second `backdrop-filter` coûtait en plus une recomposition à chaque image
// de l'animation d'entrée.

// Sous `lg`, une boîte de dialogue est une feuille du bas, et une feuille se
// referme au doigt. Elle en avait l'allure sans le geste : on la tirait vers
// le bas et rien ne bougeait (révision du 2026-09-23). Elle passe donc par le
// même `Drawer` que les autres feuilles ; Base UI bâtit le Drawer sur le
// Dialog, titre, description, déclencheur et croix sont les mêmes pièces.
const SheetContext = React.createContext(false)

function Dialog(props: DialogPrimitive.Root.Props): React.JSX.Element {
  const isMobile = useIsMobile()
  if (!isMobile) return <DialogPrimitive.Root {...props} />
  return (
    <SheetContext.Provider value={true}>
      <Drawer side="bottom" {...(props as DrawerPrimitive.Root.Props)} />
    </SheetContext.Provider>
  )
}

const DialogTrigger: typeof DialogPrimitive.Trigger = DialogPrimitive.Trigger
const DialogClose: typeof DialogPrimitive.Close = DialogPrimitive.Close

// Largeurs et hauteurs de la boîte : la feuille prend toute la largeur et
// borne elle-même sa hauteur, elles n'ont rien à y faire.
const BOX_ONLY = /^(?:[a-z0-9-]+:)*(?:max-w|w|max-h|h|overflow(?:-[xy])?)-/

function sheetClasses(className: DialogPrimitive.Popup.Props["className"]): string | undefined {
  if (typeof className !== "string") return undefined
  return className
    .split(/\s+/)
    .filter((token) => token !== "" && !BOX_ONLY.test(token) && !token.startsWith("lg:"))
    .join(" ")
}

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & { showClose?: boolean }): React.JSX.Element {
  const sheet = React.useContext(SheetContext)
  if (sheet) {
    return (
      <DrawerContent {...(props as DrawerPrimitive.Popup.Props)}>
        <div
          data-slot="dialog-content"
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-5",
            sheetClasses(className),
          )}
        >
          {children}
        </div>
        {showClose ? <DrawerCloseButton /> : null}
      </DrawerContent>
    )
  }
  return (
    <DialogPrimitive.Portal>
      {/* Assombri et flouté : le fond doit cesser d'être lisible pour que la
          boîte cesse d'être une carte de plus. */}
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-(--duration-slow) ease-ios data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Pas d'anneau : la boîte est déjà détachée par le voile qui assombrit
          // tout le reste. L'ombre, douce, reste la seule de l'interface avec
          // celle des menus — elle dit « au-dessus », rien d'autre.
          //
          // Entrée et sortie en transitions (pas en keyframes) : une boîte
          // fermée pendant son ouverture repart de là où elle en est. Elle
          // monte de 0.97 à 1 sur la courbe iOS, centrée — une boîte modale
          // n'a pas d'ancre dont partir.
          "fixed z-50 grid gap-4 overflow-y-auto bg-popover text-popover-foreground shadow-2xl shadow-black/10 outline-none",
          // Écran large seulement : sous `lg`, c'est la feuille ci-dessus.
          "lg:top-1/2 lg:left-1/2 lg:max-h-[calc(100dvh-2rem)] lg:w-[calc(100%-2rem)] lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:p-6 lg:transition-[opacity,scale] lg:duration-(--duration-slow) lg:ease-ios lg:data-ending-style:scale-[0.97] lg:data-ending-style:opacity-0 lg:data-ending-style:duration-(--duration-base) lg:data-starting-style:scale-[0.97] lg:data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className="touch-target absolute top-4 right-4 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Fermer"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props): React.JSX.Element {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-lg font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props): React.JSX.Element {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div data-slot="dialog-body" className={cn("", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
}
