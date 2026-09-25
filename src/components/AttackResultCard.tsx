import { motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, Unplug } from "lucide-react"
import type { AttackErrorEvent, AttackResultEvent } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_META } from "@/lib/categories"
import { cn } from "@/lib/utils"

type AttackResultCardProps = {
  item:
    | { kind: "result"; data: AttackResultEvent }
    | { kind: "error"; data: AttackErrorEvent }
}

export function AttackResultCard({ item }: AttackResultCardProps) {
  if (item.kind === "error") {
    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl px-4 py-3 opacity-70"
      >
        <div className="flex items-start gap-3">
          <Unplug className="mt-0.5 h-4 w-4 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-500">{item.data.attack_id}</span>
              <Badge variant="muted">error</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Target unreachable — <span className="font-mono">{item.data.reason}</span>
            </p>
          </div>
        </div>
      </motion.article>
    )
  }

  const { data } = item

  if (data.inconclusive) {
    const category = CATEGORY_META[data.category]
    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="glass rounded-xl border-amber-500/30 bg-amber-950/10 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-5 w-5 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-400">{data.attack_id}</span>
              <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]", category.className)}>
                {category.short}
              </span>
              <Badge variant="warning">inconclusive</Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-zinc-200">{data.technique}</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-amber-200/80">{data.evidence}</p>
          </div>
        </div>
      </motion.article>
    )
  }

  const broke = data.broke_through
  const category = CATEGORY_META[data.category]

  return (
    <motion.article
      layout
      initial={broke ? { opacity: 0, y: -14, scale: 1.04 } : { opacity: 0, y: -10, scale: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "glass rounded-xl px-4 py-3",
        broke && "breach-pulse border-red-500/50 bg-red-950/40",
      )}
    >
      <div className="flex items-start gap-3">
        {broke ? (
          <ShieldAlert className="mt-0.5 h-5 w-5 text-red-400" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-zinc-400">{data.attack_id}</span>
            <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]", category.className)}>
              {category.short}
            </span>
            {broke ? (
              <Badge variant="danger">broke through</Badge>
            ) : (
              <Badge variant="success">resisted</Badge>
            )}
            {broke && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-orange-300">
                {data.severity}
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-zinc-200">{data.technique}</p>
          <p className={cn("mt-1 font-mono text-xs leading-relaxed", broke ? "text-orange-200/90" : "text-zinc-500")}>
            {data.evidence}
          </p>
          {data.confidence != null && (
            <p className="mt-2 font-mono text-[10px] text-zinc-600">
              confidence {(data.confidence * 100).toFixed(0)}%
            </p>
          )}
        </div>
        {broke && <AlertTriangle className="h-4 w-4 shrink-0 text-orange-400" />}
      </div>
    </motion.article>
  )
}
