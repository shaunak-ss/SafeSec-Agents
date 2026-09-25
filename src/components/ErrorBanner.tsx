import { motion } from "framer-motion"
import { AlertTriangle, X } from "lucide-react"

type ErrorBannerProps = {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-1 text-red-300/70 hover:bg-red-500/20 hover:text-red-100"
        aria-label="Dismiss error"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}
