import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import * as React from "react"

import { cn } from "./cn.ts"
import { avatarTone, type AvatarTone } from "./initials.ts"

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg"
}): React.JSX.Element {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props): React.JSX.Element {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...props}
    />
  )
}

/** Lavis et encre de chaque teinte (`--avatar-<n>`, `styles.css`), à 4,5:1 en clair et en sombre. */
const TONE_CLASSES: Readonly<Record<AvatarTone, string>> = {
  1: "bg-avatar-1 text-avatar-1-ink",
  2: "bg-avatar-2 text-avatar-2-ink",
  3: "bg-avatar-3 text-avatar-3-ink",
  4: "bg-avatar-4 text-avatar-4-ink",
  5: "bg-avatar-5 text-avatar-5-ink",
  6: "bg-avatar-6 text-avatar-6-ink",
  7: "bg-avatar-7 text-avatar-7-ink",
}

/**
 * Ce qui s'affiche sans photo (la photo, `AvatarImage`, reste prioritaire). Des initiales en
 * texte prennent une teinte de la marque, stable : celle de `colorKey` (identifiant ou adresse
 * e-mail, à préférer, deux homonymes n'ont pas la même couleur), sinon celle du texte. Une icône,
 * ou `colorKey={null}`, garde le gris neutre.
 */
function AvatarFallback({
  className,
  colorKey,
  children,
  ...props
}: AvatarPrimitive.Fallback.Props & { colorKey?: string | null | undefined }): React.JSX.Element {
  const key = colorKey === undefined ? (typeof children === "string" ? children : "") : (colorKey ?? "")
  const tone = key.trim() ? avatarTone(key) : null
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      data-tone={tone ?? undefined}
      className={cn(
        "flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
        tone ? cn("font-semibold", TONE_CLASSES[tone]) : "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </AvatarPrimitive.Fallback>
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
