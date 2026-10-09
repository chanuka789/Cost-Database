import * as React from "react"

import { cn } from "@/lib/utils"

/** Multi-line companion to `Input`: same surface, border and focus treatment. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content rounded-md min-h-24 w-full border border-qs-border-strong bg-qs-panel px-3 py-2.5 text-base text-qs-text transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-qs-text-faint focus-visible:border-qs-brand focus-visible:shadow-[var(--qs-focus-ring)] disabled:cursor-not-allowed disabled:bg-qs-raised disabled:opacity-60 aria-invalid:border-qs-danger aria-invalid:shadow-[var(--qs-danger-ring)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
