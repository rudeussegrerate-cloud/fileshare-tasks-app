import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 focus:border-primary",
        className
      )}
      {...props}
    />
  )
}

export { Input }
