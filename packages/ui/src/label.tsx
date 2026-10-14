import * as React from "react"

import { cn } from "./cn.ts"

function Label({ className, ...props }: React.ComponentProps<"label">): React.JSX.Element {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- primitive : `htmlFor` ou le contrôle enfant arrivent par les props
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Label }
