import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon"
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon"
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon"
import MultiplicationSignCircleIcon from "@hugeicons/core-free-icons/MultiplicationSignCircleIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

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

export { Toaster }
