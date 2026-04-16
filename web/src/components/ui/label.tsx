"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-normal select-none group-data-[disabled=true]:cursor-not-allowed group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

/** 表单必填：`text-destructive`（依赖 tailwind 中 `destructive` 色与 CSS 变量 `--destructive`） */
function RequiredMark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span className={cn("text-destructive", className)} aria-hidden="true" {...props}>
      *
    </span>
  )
}

export { Label, RequiredMark }
