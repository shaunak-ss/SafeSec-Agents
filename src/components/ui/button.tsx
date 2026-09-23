import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, type HTMLMotionProps } from "framer-motion"
import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "brand-gradient text-white shadow-[0_0_24px_rgba(99,102,241,0.28)] hover:shadow-[0_0_32px_rgba(168,85,247,0.4)]",
        outline:
          "border border-zinc-700 bg-zinc-900/60 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800",
        ghost: "text-zinc-300 hover:bg-zinc-800 hover:text-white",
        danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
        warning: "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot className={cn(buttonVariants({ variant, size }), className)} {...props} />
  }

  const motionProps = props as HTMLMotionProps<"button">
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...motionProps}
    />
  )
}

export { Button, buttonVariants }
