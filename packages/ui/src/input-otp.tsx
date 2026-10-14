import { OTPInput, OTPInputContext } from "input-otp"
import * as React from "react"

import { cn } from "./cn.ts"

/**
 * Saisie d'un code à usage unique, case par case (shadcn `input-otp`, base
 * `input-otp`). Un seul vrai `<input>` porte le clavier, le collage d'un code
 * entier et l'`autocomplete="one-time-code"` ; les cases ne font que l'afficher.
 * Habillage du champ du site : fond de page, filet à 70 %, anneau vert sur
 * la case active.
 */
function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }): React.JSX.Element {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn("flex items-center has-disabled:opacity-50", containerClassName)}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return <div data-slot="input-otp-group" className={cn("flex items-center gap-2", className)} {...props} />
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & { index: number }): React.JSX.Element {
  const context = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = context.slots[index] ?? {}
  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex h-13 w-11 items-center justify-center rounded-2xl bg-background text-xl font-medium tabular-nums ring-1 ring-border/70 transition-[box-shadow] duration-(--duration-fast) ring-inset aria-invalid:ring-2 aria-invalid:ring-destructive/60 data-[active=true]:ring-2 data-[active=true]:ring-ring sm:h-12 sm:w-10 sm:text-lg",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px bg-foreground motion-safe:animate-pulse" />
        </div>
      ) : null}
    </div>
  )
}

function InputOTPSeparator(props: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div data-slot="input-otp-separator" role="separator" className="h-px w-2.5 bg-muted-foreground/40" {...props} />
  )
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot }
