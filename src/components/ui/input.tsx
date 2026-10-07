import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 min-h-10 w-full rounded-sm border border-input bg-white px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus:border-primary",
,
        className
      )}
      {...props}
    />
  )
}

export { Input }
