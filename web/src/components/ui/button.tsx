"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * QSGS buttons: 34px high, 14px side padding, 8px radius (from the corner
 * radius tiers), 13.5px semibold text and an 8px icon gap. Primary is the brand blue;
 * secondary and outline are panel surfaces with the strong border; ghost is
 * transparent; destructive is a secondary action in danger-red text that tints
 * on hover.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md whitespace-nowrap border border-transparent text-[13.5px] font-semibold transition-[color,background-color,border-color,box-shadow,opacity] duration-150 focus-visible:outline-none focus-visible:shadow-[var(--qs-focus-ring)] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-qs-brand text-white hover:bg-qs-brand-hover",
        destructive:
          "border-qs-border-strong bg-qs-panel text-qs-danger hover:border-qs-danger/40 hover:bg-qs-danger-bg",
        outline:
          "border-qs-border-strong bg-qs-panel text-qs-text hover:bg-qs-hover active:bg-qs-pressed",
        secondary:
          "border-qs-border-strong bg-qs-panel text-qs-text hover:bg-qs-hover active:bg-qs-pressed",
        ghost:
          "bg-transparent text-qs-text-secondary hover:bg-qs-hover hover:text-qs-text active:bg-qs-pressed",
        link: "h-auto border-0 px-0 text-qs-brand-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[34px] px-3.5",
        sm: "h-7 px-2.5 text-[12.5px]",
        lg: "h-10 px-5",
        icon: "size-[34px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
