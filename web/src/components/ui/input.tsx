import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * QSGS input: 38px high, 12px side padding, panel fill and the strong
 * border; brand border and an 18% brand ring on focus. 16px text below `md` so
 * iOS does not zoom the page on focus.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[38px] w-full rounded-md min-w-0 border border-qs-border-strong bg-qs-panel px-3 text-base text-qs-text transition-[border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-qs-text placeholder:text-qs-text-faint focus-visible:border-qs-brand focus-visible:shadow-[var(--qs-focus-ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-qs-raised disabled:opacity-60 aria-invalid:border-qs-danger aria-invalid:shadow-[var(--qs-danger-ring)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
