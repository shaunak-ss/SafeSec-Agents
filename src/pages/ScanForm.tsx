import { AnimatePresence, motion } from "framer-motion"
import { LayoutDashboard, Loader2, Plus, Shield, Trash2 } from "lucide-react"
import { useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ApiError } from "@/api/sse"
import { createScan } from "@/api/client"
import type { HttpMethod } from "@/api/types"
import { AppHeader } from "@/components/AppHeader"
import { BackgroundGrid } from "@/components/BackgroundGrid"
import { ErrorBanner } from "@/components/ErrorBanner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pageTransition } from "@/lib/motion"
import { isRecord } from "@/lib/utils"

type HeaderRow = { id: string; key: string; value: string }

const DEFAULT_BODY = `{
  "message": "{{prompt}}"
}`

const METHODS: HttpMethod[] = ["POST", "GET", "PUT", "PATCH", "DELETE"]

function newRow(key = "", value = ""): HeaderRow {
  return { id: crypto.randomUUID(), key, value }
}

export default function ScanForm() {
  const navigate = useNavigate()
  const [targetName, setTargetName] = useState("My Support Bot")
  const [endpoint, setEndpoint] = useState("https://example.com/api/chat")
  const [method, setMethod] = useState<HttpMethod>("POST")
  const [headers, setHeaders] = useState<HeaderRow[]>([newRow("Authorization", "Bearer ")])
  const [bodyTemplate, setBodyTemplate] = useState(DEFAULT_BODY)
  const [responsePath, setResponsePath] = useState("reply")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateHeader(id: string, patch: Partial<HeaderRow>) {
    setHeaders((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!targetName.trim()) {
      setError("Give the target a name so the report is readable.")
      return
    }
    if (!endpoint.trim() || !/^https?:\/\//i.test(endpoint.trim())) {
      setError("Target endpoint must be an http(s) URL.")
      return
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(bodyTemplate)
    } catch {
      setError("Body template must be valid JSON.")
      return
    }
    if (!isRecord(parsedBody)) {
      setError("Body template must be a JSON object.")
      return
    }

    const targetHeaders: Record<string, string> = {}
    for (const row of headers) {
      if (row.key.trim()) targetHeaders[row.key.trim()] = row.value
    }

    setSubmitting(true)
    try {
      const created = await createScan({
        target_name: targetName.trim(),
        target_endpoint: endpoint.trim(),
        target_method: method,
        target_headers: targetHeaders,
        target_body_template: parsedBody,
        target_response_path: responsePath.trim() || "reply",
      })
      navigate(`/scans/${created.scan_id}`)
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "Request failed"
      setError(detail)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div {...pageTransition} className="relative min-h-screen px-4 py-8 sm:px-8">
      <BackgroundGrid />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <AppHeader />

        <section className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient shadow-[0_0_40px_rgba(99,102,241,0.45)]">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <p className="mb-3 font-mono text-xs tracking-[0.22em] text-indigo-300 uppercase">
            Adversarial red team
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            50 jailbreak attacks. 60 seconds.
            <span className="mt-2 block text-brand-gradient">See if your bot breaks.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-400">
            Point SafeSec Agents at any chat endpoint. We fire OWASP-tagged prompt injections, agency
            abuse, and system-prompt leaks — and show you the breakthroughs live.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <LayoutDashboard className="h-4 w-4" />
            View past scans
          </Link>
        </section>

        <form onSubmit={onSubmit} className="glass rounded-2xl p-6 sm:p-8">
          <AnimatePresence>
            {error && (
              <div className="mb-6">
                <ErrorBanner message={error} onDismiss={() => setError(null)} />
              </div>
            )}
          </AnimatePresence>

          <div className="grid gap-5">
            <Field label="Target name" htmlFor="target_name">
              <Input
                id="target_name"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="My Support Bot"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
              <Field label="Method" htmlFor="target_method">
                <Select value={method} onValueChange={(value) => setMethod(value as HttpMethod)}>
                  <SelectTrigger id="target_method" className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((item) => (
                      <SelectItem key={item} value={item} className="font-mono">
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Target endpoint" htmlFor="target_endpoint">
                <Input
                  id="target_endpoint"
                  className="font-mono"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://example.com/api/chat"
                />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Headers</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHeaders((rows) => [...rows, newRow()])}
                >
                  <Plus />
                  Add header
                </Button>
              </div>
              <div className="grid gap-2">
                {headers.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      className="font-mono"
                      placeholder="Authorization"
                      value={row.key}
                      onChange={(e) => updateHeader(row.id, { key: e.target.value })}
                    />
                    <Input
                      className="font-mono"
                      placeholder="Bearer …"
                      value={row.value}
                      onChange={(e) => updateHeader(row.id, { value: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setHeaders((rows) =>
                          rows.length === 1 ? [newRow("Authorization", "")] : rows.filter((r) => r.id !== row.id),
                        )
                      }
                      aria-label="Remove header"
                    >
                      <Trash2 className="h-4 w-4 text-zinc-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Body template" htmlFor="target_body_template">
              <textarea
                id="target_body_template"
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 font-mono text-sm text-zinc-100 shadow-inner focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:outline-none"
              />
              <p className="mt-2 text-xs text-zinc-500">
                <code className="font-mono text-zinc-400">{"{{prompt}}"}</code> is replaced with each
                attack payload.
              </p>
            </Field>

            <Field label="Response path" htmlFor="target_response_path">
              <Input
                id="target_response_path"
                className="font-mono"
                value={responsePath}
                onChange={(e) => setResponsePath(e.target.value)}
                placeholder="reply"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Dot-path to the reply text in your bot&apos;s JSON response, e.g.{" "}
                <code className="font-mono text-zinc-400">choices.0.message.content</code>
              </p>
            </Field>
          </div>

          <motion.div className="mt-8" whileHover={{ y: -1 }}>
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Shield />}
              {submitting ? "Queuing scan…" : "Run 50 attacks"}
            </Button>
          </motion.div>
        </form>
      </div>
    </motion.div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
