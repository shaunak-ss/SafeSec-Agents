import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { easeOutExpo } from "@/lib/motion"

type ProgressBarProps = {
  completed: number
  total: number
  running?: boolean
  className?: string
}

export function ProgressBar({ completed, total, running = false, className }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0

  return (
    <div className={cn("w-full", className)}>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          className="relative h-full overflow-hidden rounded-full brand-gradient"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: easeOutExpo }}
        >
          {running && pct < 100 && (
            <div className="shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          )}
        </motion.div>
      </div>
    </div>
  )
}
