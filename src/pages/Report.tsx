import { AnimatePresence, motion } from "framer-motion"
import { Download, Filter } from "lucide-react"
import { useMemo, useState } from "react"
import type { OwaspCategory, ScanCompleteEvent, ScanRecord, ScanResult } from "@/api/types"
import { reportUrl, USE_MOCK } from "@/api/client"
import { AppHeader } from "@/components/AppHeader"
import { BackgroundGrid } from "@/components/BackgroundGrid"
import { CategoryBreakdownChart } from "@/components/CategoryBreakdownChart"
import { RiskBadge } from "@/components/RiskBadge"
import { StatCard } from "@/components/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"
import { pageTransition } from "@/lib/motion"
import { cn, formatDuration } from "@/lib/utils"

type ReportProps = {
  scan: ScanRecord
  complete?: ScanCompleteEvent | null
}

export default function Report({ scan, complete }: ReportProps) {
  const [category, setCategory] = useState<"all" | OwaspCategory>("all")
  const [brokeOnly, setBrokeOnly] = useState(false)
  const [inconclusiveOnly, setInconclusiveOnly] = useState(false)

  const duration = complete?.duration_ms
  const errorCount = complete?.error_count ?? 0

  const filtered = useMemo(() => {
    return scan.results.filter((row) => {
      if (category !== "all" && row.category !== category) return false
      if (brokeOnly && !row.broke_through) return false
      if (inconclusiveOnly && !row.inconclusive) return false
      return true
    })
  }, [scan.results, category, brokeOnly, inconclusiveOnly])

  return (
    <motion.div {...pageTransition} className="relative min-h-screen px-4 py-8 sm:px-8">
      <BackgroundGrid />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <AppHeader scanId={scan.scan_id} />

        <section className="glass rounded-2xl p-6 sm:p-8">
          <p className="font-mono text-xs tracking-[0.2em] text-zinc-500 uppercase">Scan complete</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{scan.target_name}</h1>
              <p className="mt-2 font-mono text-sm text-zinc-500">{scan.scan_id}</p>
            </div>
            <RiskBadge score={scan.risk_score} size="lg" animateIn />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-5">
            <StatCard label="Attacks" value={String(scan.total_attacks)} />
            <StatCard
              label="Broke through"
              value={String(scan.broke_through_count)}
              danger={scan.broke_through_count > 0}
            />
            <StatCard
              label="Inconclusive"
              value={String(scan.inconclusive_count)}
              warning={scan.inconclusive_count > 0}
            />
            <StatCard label="Errors" value={String(errorCount)} muted />
            <StatCard label="Duration" value={duration != null ? formatDuration(duration) : "—"} />
          </div>

          <div className="mt-6">
            {USE_MOCK ? (
              <Button variant="outline" type="button" disabled title="HTML report is served by the backend">
                <Download />
                Download full report
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <a href={reportUrl(scan.scan_id)} target="_blank" rel="noreferrer">
                  <Download />
                  Download full report
                </a>
              </Button>
            )}
          </div>
        </section>

        <CategoryBreakdownChart breakdown={scan.category_breakdown} />

        <section className="glass rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-medium">Results</h2>
              <span className="font-mono text-xs text-zinc-500">{filtered.length}</span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={brokeOnly ? "danger" : "outline"}
                onClick={() => setBrokeOnly((value) => !value)}
              >
                Broke through only
              </Button>
              <Button
                type="button"
                size="sm"
                variant={inconclusiveOnly ? "warning" : "outline"}
                onClick={() => setInconclusiveOnly((value) => !value)}
              >
                Inconclusive only
              </Button>
            </div>
          </div>

          <Tabs value={category} onValueChange={(value) => setCategory(value as "all" | OwaspCategory)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All</TabsTrigger>
              {CATEGORY_ORDER.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {item}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 font-mono text-[11px] tracking-wider text-zinc-500 uppercase">
                  <th className="py-2 pr-3 font-medium">Attack</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Technique</th>
                  <th className="py-2 pr-3 font-medium">Verdict</th>
                  <th className="py-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((row) => (
                    <ResultRow key={row.attack_id} row={row} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-zinc-500">No results match this filter.</p>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  )
}

function ResultRow({ row }: { row: ScanResult }) {
  const meta = CATEGORY_META[row.category]
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="border-b border-zinc-800/80"
    >
      <td className="py-3 pr-3 font-mono text-xs text-zinc-400">{row.attack_id}</td>
      <td className="py-3 pr-3">
        <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]", meta.className)}>
          {row.category}
        </span>
      </td>
      <td className="py-3 pr-3 font-mono text-xs text-zinc-200">{row.technique}</td>
      <td className="py-3 pr-3">
        {row.inconclusive ? (
          <Badge variant="warning">inconclusive</Badge>
        ) : row.broke_through ? (
          <Badge variant="danger">{row.severity}</Badge>
        ) : (
          <Badge variant="success">resisted</Badge>
        )}
      </td>
      <td className="max-w-md py-3 font-mono text-xs leading-relaxed text-zinc-500">
        {row.inconclusive ? `${row.reason ?? "unknown"} — ${row.evidence}` : row.evidence}
      </td>
    </motion.tr>
  )
}
