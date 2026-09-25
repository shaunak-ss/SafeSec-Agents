import { AnimatePresence, motion } from "framer-motion"
import { HelpCircle, Loader2, ShieldAlert, Unplug } from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getScan, streamScan } from "@/api/client"
import { ApiError } from "@/api/sse"
import {
  breakdownFromResults,
  resultFromEvent,
  type AttackErrorEvent,
  type AttackResultEvent,
  type ScanCompleteEvent,
  type ScanRecord,
  type ScanResult,
} from "@/api/types"
import { AnimatedCounter } from "@/components/AnimatedCounter"
import { AppHeader } from "@/components/AppHeader"
import { AttackResultCard } from "@/components/AttackResultCard"
import { BackgroundGrid } from "@/components/BackgroundGrid"
import { ErrorBanner } from "@/components/ErrorBanner"
import { ProgressBar } from "@/components/ProgressBar"
import { RouteFallback } from "@/components/RouteFallback"
import { Button } from "@/components/ui/button"
import { pageTransition } from "@/lib/motion"

// Report pulls in recharts (a sizeable chart lib) only needed once a scan
// finishes, so it's split into its own chunk rather than bundled with the
// live-scan view that every scan visits first.
const Report = lazy(() => import("@/pages/Report"))

type FeedItem =
  | { kind: "result"; data: AttackResultEvent }
  | { kind: "error"; data: AttackErrorEvent }

type LiveState = {
  scan: ScanRecord
  completed: number
  total: number
  brokeThrough: number
  inconclusive: number
  errors: number
  feed: FeedItem[]
}

export default function ScanRoute() {
  const { id } = useParams()
  const [phase, setPhase] = useState<"loading" | "live" | "report" | "failed" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [reportScan, setReportScan] = useState<ScanRecord | null>(null)
  const [completeEvent, setCompleteEvent] = useState<ScanCompleteEvent | null>(null)

  useEffect(() => {
    if (!id) {
      setPhase("error")
      setError("Missing scan id.")
      return
    }

    const controller = new AbortController()

    async function run(scanId: string) {
      try {
        const record = await getScan(scanId)
        if (controller.signal.aborted) return

        if (record.status === "failed") {
          setPhase("failed")
          return
        }

        if (record.status === "complete") {
          setReportScan(record)
          setPhase("report")
          return
        }

        const initial: LiveState = {
          scan: record,
          completed: record.results.length,
          total: record.total_attacks,
          brokeThrough: record.broke_through_count,
          inconclusive: record.inconclusive_count,
          errors: 0,
          feed: record.results.map((result) => ({
            kind: "result",
            data: {
              type: "attack_result",
              ...result,
              progress: { completed: record.results.length, total: record.total_attacks },
            },
          })),
        }
        setLive(initial)
        setPhase("live")

        const results: ScanResult[] = [...record.results]
        const seen = new Set(results.map((result) => result.attack_id))
        let brokeThrough = record.broke_through_count

        await streamScan(
          scanId,
          (event) => {
            if (event.type === "scan_started") {
              setLive((current) =>
                current ? { ...current, total: event.total_attacks } : current,
              )
              return
            }

            if (event.type === "attack_result") {
              if (seen.has(event.attack_id)) return
              seen.add(event.attack_id)
              results.push(resultFromEvent(event))
              if (event.broke_through) brokeThrough += 1
              setLive((current) => {
                if (!current) return current
                return {
                  ...current,
                  completed: event.progress.completed,
                  total: event.progress.total,
                  brokeThrough: current.brokeThrough + (event.broke_through ? 1 : 0),
                  inconclusive: current.inconclusive + (event.inconclusive ? 1 : 0),
                  feed: [{ kind: "result", data: event }, ...current.feed],
                }
              })
              return
            }

            if (event.type === "attack_error") {
              if (seen.has(event.attack_id)) return
              seen.add(event.attack_id)
              setLive((current) => {
                if (!current) return current
                return {
                  ...current,
                  completed: event.progress.completed,
                  total: event.progress.total,
                  errors: current.errors + 1,
                  feed: [{ kind: "error", data: event }, ...current.feed],
                }
              })
              return
            }

            if (event.type === "scan_complete") {
              const finished: ScanRecord = {
                ...record,
                status: "complete",
                completed_at: new Date().toISOString(),
                broke_through_count: event.broke_through_count || brokeThrough,
                inconclusive_count: event.inconclusive_count,
                risk_score: event.risk_score,
                category_breakdown: breakdownFromResults(results),
                results: [...results],
              }
              setCompleteEvent(event)
              setReportScan(finished)
              setPhase("report")
            }
          },
          controller.signal,
        )
      } catch (err) {
        if (controller.signal.aborted) return
        const detail = err instanceof ApiError ? err.detail : "Request failed"
        setError(detail)
        setPhase("error")
      }
    }

    void run(id)
    return () => controller.abort()
  }, [id])

  if (phase === "loading") {
    return (
      <motion.div {...pageTransition} className="relative flex min-h-screen items-center justify-center">
        <BackgroundGrid />
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Opening scan…
        </div>
      </motion.div>
    )
  }

  if (phase === "error") {
    return (
      <motion.div {...pageTransition} className="relative min-h-screen px-4 py-8 sm:px-8">
        <BackgroundGrid />
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <AppHeader scanId={id} />
          <ErrorBanner message={error ?? "Request failed"} onDismiss={() => setError(null)} />
          <Button asChild variant="outline">
            <Link to="/">Back to scan form</Link>
          </Button>
        </div>
      </motion.div>
    )
  }

  if (phase === "failed") {
    return (
      <motion.div {...pageTransition} className="relative min-h-screen px-4 py-8 sm:px-8">
        <BackgroundGrid />
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <AppHeader scanId={id} />
          <div className="glass rounded-2xl p-8 text-center">
            <Unplug className="mx-auto h-8 w-8 text-zinc-500" />
            <h1 className="mt-4 text-xl font-semibold">This scan could not complete</h1>
            <p className="mt-2 text-sm text-zinc-400">
              The target may have been unreachable throughout. Results and category breakdown may be
              empty or partial.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/">Run another scan</Link>
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "live" && live && <LiveScan key="live" state={live} />}
      {phase === "report" && reportScan && (
        <Suspense fallback={<RouteFallback />}>
          <Report key="report" scan={reportScan} complete={completeEvent} />
        </Suspense>
      )}
    </AnimatePresence>
  )
}

function LiveScan({ state }: { state: LiveState }) {
  return (
    <motion.div {...pageTransition} className="relative min-h-screen px-4 py-8 sm:px-8">
      <BackgroundGrid />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <AppHeader scanId={state.scan.scan_id} />

        <section className="glass rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-indigo-300 uppercase">Live scan</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{state.scan.target_name}</h1>
            </div>
            <span className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400 shadow-[0_0_10px_#6366f1]" />
              running
            </span>
          </div>

          <div className="mt-5">
            <ProgressBar completed={state.completed} total={state.total} running />
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <p className="text-lg text-zinc-200">
              <AnimatedCounter value={state.completed} className="font-mono text-3xl font-semibold text-white" />
              <span className="mx-1 text-zinc-500">of</span>
              <span className="font-mono text-3xl font-semibold text-zinc-400">{state.total}</span>
              <span className="ml-2 text-sm text-zinc-500">attacks</span>
            </p>
            <p className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <AnimatedCounter
                value={state.brokeThrough}
                className="font-mono text-3xl font-semibold text-breach-gradient"
              />
              <span className="text-zinc-500">broke through</span>
            </p>
            {state.inconclusive > 0 && (
              <p className="flex items-center gap-2 text-sm">
                <HelpCircle className="h-4 w-4 text-amber-400" />
                <AnimatedCounter value={state.inconclusive} className="font-mono text-3xl font-semibold text-amber-300" />
                <span className="text-zinc-500">inconclusive</span>
              </p>
            )}
            {state.errors > 0 && (
              <p className="font-mono text-sm text-zinc-500">
                <AnimatedCounter value={state.errors} /> errors
              </p>
            )}
          </div>
        </section>

        <section className="scrollbar-thin flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {state.feed.map((item) => (
              <AttackResultCard
                key={item.kind === "result" ? item.data.attack_id : `err-${item.data.attack_id}`}
                item={item}
              />
            ))}
          </AnimatePresence>
          {state.feed.length === 0 && (
            <p className="py-12 text-center font-mono text-sm text-zinc-600">Waiting for first attack…</p>
          )}
        </section>
      </div>
    </motion.div>
  )
}
