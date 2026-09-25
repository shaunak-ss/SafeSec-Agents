import { motion } from "framer-motion"
import { ArrowRight, LayoutDashboard, Loader2, Plus, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { RiskScore, ScanSummary } from "@/api/types"
import { listScans } from "@/api/client"
import { AppHeader } from "@/components/AppHeader"
import { BackgroundGrid } from "@/components/BackgroundGrid"
import { RiskBadge } from "@/components/RiskBadge"
import { StatCard } from "@/components/StatCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageTransition } from "@/lib/motion"
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils"

const POLL_INTERVAL_MS = 5000
const PAGE_SIZE = 20

const RISK_FILTERS: Array<"all" | RiskScore> = ["all", "low", "medium", "high", "critical"]

const STATUS_STYLES: Record<ScanSummary["status"], { dot: string; label: string }> = {
  queued: { dot: "bg-zinc-500", label: "queued" },
  running: { dot: "bg-indigo-400 animate-pulse", label: "running" },
  complete: { dot: "bg-emerald-400", label: "complete" },
  failed: { dot: "bg-red-500", label: "failed" },
}

export default function Dashboard() {
  const [scans, setScans] = useState<ScanSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState<"all" | RiskScore>("all")

  useEffect(() => {
    let cancelled = false

    listScans(PAGE_SIZE, 0)
      .then((response) => {
        if (cancelled) return
        setScans(response.scans)
        setTotal(response.total)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError("Could not load scans.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Polls only while a scan is still queued/running — re-arms every time
  // `scans` updates, giving a steady ~5s cadence without a stale closure.
  // Refetches exactly as many rows as are currently loaded (not a fixed
  // page), so an in-progress "load more" position isn't reset by a poll.
  useEffect(() => {
    const hasActive = scans.some((s) => s.status === "queued" || s.status === "running")
    if (!hasActive) return
    const loadedCount = scans.length
    const id = setTimeout(() => {
      listScans(loadedCount, 0)
        .then((response) => {
          setScans(response.scans)
          setTotal(response.total)
        })
        .catch(() => {
          // keep showing the last known list; the next tick will retry
        })
    }, POLL_INTERVAL_MS)
    return () => clearTimeout(id)
  }, [scans])

  const loadMore = () => {
    setLoadingMore(true)
    listScans(PAGE_SIZE, scans.length)
      .then((response) => {
        setScans((current) => [...current, ...response.scans])
        setTotal(response.total)
      })
      .catch(() => setError("Could not load more scans."))
      .finally(() => setLoadingMore(false))
  }

  const filtered = useMemo(() => {
    return scans.filter((scan) => {
      if (search.trim() && !scan.target_name.toLowerCase().includes(search.trim().toLowerCase())) {
        return false
      }
      if (riskFilter !== "all" && scan.risk_score !== riskFilter) return false
      return true
    })
  }, [scans, search, riskFilter])

  const totals = useMemo(() => {
    const completed = scans.filter((s) => s.status === "complete")
    const totalAttacks = completed.reduce((sum, s) => sum + s.total_attacks, 0)
    const totalBroke = completed.reduce((sum, s) => sum + s.broke_through_count, 0)
    const running = scans.filter((s) => s.status === "queued" || s.status === "running").length
    return {
      totalScans: total,
      totalAttacks,
      breakthroughRate: totalAttacks > 0 ? Math.round((totalBroke / totalAttacks) * 100) : 0,
      running,
    }
  }, [scans, total])

  return (
    <motion.div {...pageTransition} className="relative min-h-screen px-4 py-8 sm:px-8">
      <BackgroundGrid />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <AppHeader />

        <section className="glass rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-zinc-500 uppercase">Monitoring</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                <LayoutDashboard className="h-7 w-7 text-indigo-400" />
                Scans dashboard
              </h1>
            </div>
            <Button asChild>
              <Link to="/">
                <Plus />
                New scan
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <StatCard label="Total scans" value={String(totals.totalScans)} />
            <StatCard label="Attacks run" value={String(totals.totalAttacks)} />
            <StatCard
              label="Breakthrough rate"
              value={`${totals.breakthroughRate}%`}
              danger={totals.breakthroughRate > 0}
            />
            <StatCard label="Running now" value={String(totals.running)} warning={totals.running > 0} />
          </div>
        </section>

        <section className="glass rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by target name…"
                className="pl-9"
              />
            </div>
            <Tabs value={riskFilter} onValueChange={(value) => setRiskFilter(value as "all" | RiskScore)}>
              <TabsList>
                {RISK_FILTERS.map((item) => (
                  <TabsTrigger key={item} value={item}>
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading scans…
            </div>
          ) : error ? (
            <p className="py-16 text-center text-sm text-red-400">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              {scans.length === 0 ? (
                <>
                  No scans yet.{" "}
                  <Link to="/" className="text-indigo-400 hover:underline">
                    Run your first scan
                  </Link>
                  .
                </>
              ) : (
                "No scans match this filter."
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((scan) => (
                <ScanRow key={scan.scan_id} scan={scan} />
              ))}
            </div>
          )}

          {!loading && !error && scans.length > 0 && scans.length < total && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="font-mono text-xs text-zinc-500">
                Showing {scans.length} of {total} scans
              </p>
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </section>
      </div>
    </motion.div>
  )
}

function ScanRow({ scan }: { scan: ScanSummary }) {
  const status = STATUS_STYLES[scan.status]
  return (
    <Link
      to={`/scans/${scan.scan_id}`}
      className="group flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition-colors hover:border-zinc-600 hover:bg-zinc-900/60"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", status.dot)} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{scan.target_name}</p>
        <p className="font-mono text-xs text-zinc-500">
          {scan.scan_id} · {status.label} · {formatRelativeTime(scan.started_at)}
        </p>
      </div>

      <div className="flex items-center gap-4 font-mono text-xs">
        {scan.risk_score ? (
          <RiskBadge score={scan.risk_score} />
        ) : (
          <span className="text-zinc-600">—</span>
        )}
        <span className="text-red-400">{scan.broke_through_count} broke</span>
        {scan.inconclusive_count > 0 && (
          <span className="text-amber-400">{scan.inconclusive_count} inconclusive</span>
        )}
        {scan.error_count > 0 && <span className="text-zinc-500">{scan.error_count} errors</span>}
        <span className="text-zinc-500">
          {scan.duration_ms != null ? formatDuration(scan.duration_ms) : "—"}
        </span>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300" />
    </Link>
  )
}
