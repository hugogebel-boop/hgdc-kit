import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon"
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon"
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon"
import MultiplicationSignCircleIcon from "@hugeicons/core-free-icons/MultiplicationSignCircleIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

import { Spinner } from "./spinner.tsx"
import { useTheme } from "./theme.tsx"

function Toaster(props: ToasterProps): React.JSX.Element {
  const { theme } = useTheme()

  // Offset = hauteur navbar (3.25rem) + safe-area-inset-top + petit gap (0.5rem)
  // pour que les toasts top-right ne soient pas mangés par le header sticky
  // ni par le notch iOS PWA.
  const topOffset = "calc(env(safe-area-inset-top) + 3.75rem)"

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-right"
      offset={{ top: topOffset, right: "1rem", left: "1rem", bottom: "1rem" }}
      mobileOffset={{ top: topOffset, right: "0.75rem", left: "0.75rem", bottom: "1rem" }}
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />,
        error: <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4" />,
        loading: (
          <span aria-hidden>
            <Spinner />
          </span>
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

/**
 * Retour d'une action réversible, avec « Annuler » pendant quelques secondes : on agit tout de
 * suite (mise à jour optimiste), sans boîte de confirmation, et on laisse revenir en arrière.
 * Une action qui ne se rattrape pas passe par `DestructiveDialog`.
 *
 * `onUndo` défait l'action. `onCommit`, s'il est donné, part quand le toast se ferme sans
 * annulation (délai écoulé, fermé à la main) : pour une action différée, envoyée seulement
 * une fois le délai passé. Rend l'identifiant du toast (`toast.dismiss(id)`).
 */
function toastUndo(
  message: React.ReactNode,
  {
    onUndo,
    onCommit,
    description,
    duration = 6000,
    undoLabel = "Annuler",
  }: {
    onUndo: () => unknown
    onCommit?: () => unknown
    description?: React.ReactNode
    /** En millisecondes ; Sonner met le délai en pause au survol et quand l'onglet est caché. */
    duration?: number
    undoLabel?: string
  },
): string | number {
  let settled = false
  const commit = () => {
    if (settled) return
    settled = true
    void onCommit?.()
  }
  return toast(message, {
    description,
    duration,
    action: {
      label: undoLabel,
      onClick: () => {
        if (settled) return
        settled = true
        void onUndo()
      },
    },
    onAutoClose: commit,
    onDismiss: commit,
  })
}

/** Le message d'une erreur, lisible : celui de l'`Error`, sinon une phrase générique. */
function errorMessage(error: unknown, fallback = "Quelque chose n'a pas marché. Réessaie."): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message
  if (typeof error === "string" && error.trim() !== "") return error
  return fallback
}

export { Toaster, toastUndo, errorMessage }
