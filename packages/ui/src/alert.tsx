import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon"
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon"
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon"
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import type { ReactNode } from "react"

import { cn } from "./cn.ts"

export type AlertTone = "info" | "success" | "warning" | "destructive"

const TONES: Record<AlertTone, { box: string; icon: string; glyph: IconSvgElement }> = {
  info: { box: "bg-info/10", icon: "text-info-ink", glyph: InformationCircleIcon },
  success: { box: "bg-status-active/12", icon: "text-status-active-ink", glyph: CheckmarkCircle02Icon },
  warning: { box: "bg-status-paused/14", icon: "text-status-paused-ink", glyph: Alert02Icon },
  destructive: { box: "bg-destructive/10", icon: "text-destructive", glyph: AlertCircleIcon },
}

/**
 * Message posé dans la page, non bloquant : une information, un succès durable, un avertissement,
 * une erreur. Lavis de la couleur, icône dans son encre, texte en couleur de texte : la couleur
 * ne porte jamais seule le sens, l'icône et le titre le disent aussi.
 *
 * Une erreur s'annonce tout de suite (`role="alert"`), le reste poliment (`role="status"`).
 * Pour un choix qui bloque, c'est un `Dialog`.
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  tone?: AlertTone
  title?: ReactNode
  /** Un bouton ou un lien à droite (« Réessayer », « Voir la doc »). */
  action?: ReactNode
  /** Remplace l'icône du ton. */
  icon?: IconSvgElement
}): React.JSX.Element {
  const t = TONES[tone]
  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      data-slot="alert"
      data-tone={tone}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-2xl px-4 py-3 text-sm sm:flex-nowrap",
        t.box,
        className,
      )}
      {...props}
    >
      <HugeiconsIcon
        icon={icon ?? t.glyph}
        strokeWidth={2}
        aria-hidden
        className={cn("mt-0.5 size-4.5 shrink-0", t.icon)}
      />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className={cn("text-foreground/80", title ? "mt-0.5" : undefined)}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:pl-7.5">{action}</div> : null}
    </div>
  )
}
