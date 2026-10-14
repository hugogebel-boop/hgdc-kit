import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "./cn.ts"

/**
 * Inline spinner - Hugeicons `Loading03Icon` + animate-spin.
 * Hugeicons gardent l'identite DA, contrairement a un raw SVG ou un Tailwind border-spin.
 */
export function Spinner({
  className,
  label,
  size = 4,
}: {
  className?: string
  label?: string
  size?: 3 | 4 | 5 | 6
}): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <HugeiconsIcon
        icon={Loading03Icon}
        strokeWidth={2}
        className={cn(
          "animate-spin",
          size === 3 && "size-3",
          size === 4 && "size-4",
          size === 5 && "size-5",
          size === 6 && "size-6",
        )}
      />
      {label ? <span>{label}</span> : null}
    </span>
  )
}
