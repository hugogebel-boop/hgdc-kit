import type { ReactNode } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "./avatar.tsx"
import { initials } from "./initials.ts"
import { RoleBadge, type OrgRole } from "./org-switcher.tsx"
import { ResourceItem } from "./resource-list.tsx"

/**
 * Une personne d'une organisation, dans une `ResourceList` : avatar (photo ou initiales),
 * nom, « (toi) », adresse e-mail et rôle. La même ligne dans tous les produits ; le rôle reste
 * visible sur téléphone.
 *
 * ```tsx
 * <ResourceList>
 *   {members.map((m) => (
 *     <MemberItem key={m.id} name={m.name} email={m.email} orgRole={m.role} isMe={m.isMe} />
 *   ))}
 * </ResourceList>
 * ```
 */
export function MemberItem({
  name,
  email,
  orgRole: role,
  image,
  isMe = false,
  roleHint,
  actions,
  className,
}: {
  name: string
  email?: string
  /** Rôle dans l'organisation (`role` est réservé à ARIA). */
  orgRole?: OrgRole | null
  image?: string | null
  isMe?: boolean
  /** Ce que le rôle permet, au survol du badge. */
  roleHint?: string
  /** Menu « … » ou boutons-icônes. */
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  const shown = name.trim() || email || "Sans nom"
  return (
    <ResourceItem
      className={className}
      icon={
        <Avatar className="size-10">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback colorKey={email || name} className="text-xs font-semibold">
            {initials(name, email)}
          </AvatarFallback>
        </Avatar>
      }
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{shown}</span>
          {isMe ? <span className="shrink-0 font-normal text-muted-foreground">(toi)</span> : null}
        </span>
      }
      meta={email && email !== shown ? email : undefined}
      badge={role ? <RoleBadge orgRole={role} {...(roleHint !== undefined ? { title: roleHint } : {})} /> : undefined}
      actions={actions}
    />
  )
}
