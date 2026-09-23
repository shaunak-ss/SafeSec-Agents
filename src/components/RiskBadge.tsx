import { motion } from "framer-motion"
import type { RiskScore } from "@/api/types"
import { cn } from "@/lib/utils"

const RISK_STYLES: Record<RiskScore, { label: string; className: string; glow: string }> = {
  low: {
    label: "LOW",
    className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
    glow: "0 0 18px rgba(16, 224, 128, 0.25)",
  },
  medium: {
    label: "MEDIUM",
    className: "border-amber-400/40 bg-amber-500/10 text-amber-300",
    glow: "0 0 22px rgba(251, 191, 36, 0.35)",
  },
  high: {
    label: "HIGH",
    className: "border-orange-400/50 bg-orange-500/10 text-orange-300",
    glow: "0 0 28px rgba(251, 146, 60, 0.45)",
  },
  critical: {
    label: "CRITICAL",
    className: "border-red-500/60 bg-red-500/15 text-red-300",
    glow: "0 0 36px rgba(239, 68, 68, 0.55)",
  },
}

type RiskBadgeProps = {
  score: RiskScore
  size?: "sm" | "lg"
  animateIn?: boolean
}

export function RiskBadge({ score, size = "sm", animateIn = false }: RiskBadgeProps) {
  const style = RISK_STYLES[score]

  return (
    <motion.span
      initial={animateIn ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        animateIn
          ? { type: "spring", stiffness: 420, damping: 18, mass: 0.7 }
          : { duration: 0 }
      }
      className={cn(
        "inline-flex items-center rounded-md border font-mono font-semibold tracking-[0.18em] uppercase",
        size === "lg" ? "px-4 py-2 text-lg" : "px-2 py-0.5 text-[11px]",
        style.className,
      )}
      style={{ boxShadow: style.glow }}
    >
      {style.label}
    </motion.span>
  )
}
