import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-800 text-zinc-300",
        success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
        danger: "border-red-500/40 bg-red-500/10 text-red-300",
        warning: "border-amber-400/30 bg-amber-500/10 text-amber-300",
        muted: "border-zinc-800 bg-zinc-900 text-zinc-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
