import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex min-h-19.5 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-y overflow-hidden overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-800/20 [&::-webkit-scrollbar-track]:dark:bg-zinc-900/50 [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar-thumb]:dark:bg-zinc-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-resizer]:bg-zinc-700 [&::-webkit-resizer]:rounded-br-md [&::-webkit-scrollbar-corner]:bg-transparent scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600",
        className
      )}
      {...props}
    />
  )
}
Textarea.displayName = "Textarea"

export { Textarea }
