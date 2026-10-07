import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-[15px] font-semibold border disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-primary hover:brightness-95",
        destructive:
          "bg-destructive text-white border-destructive hover:brightness-95",
        outline:
          "border-border bg-card text-foreground hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground border-border hover:bg-muted",
        ghost:
          "border-transparent hover:bg-secondary",
        link: "border-transparent text-primary underline-offset-2 hover:underline",
      },
      size: {
        default: "h-10 min-h-10 px-4 py-2",
        sm: "h-9 min-h-9 px-3 text-sm",
        lg: "h-11 min-h-11 px-6 text-base",
        icon: "size-10 min-h-10",
        "icon-sm": "size-9 min-h-9",
        "icon-lg": "size-11 min-h-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
