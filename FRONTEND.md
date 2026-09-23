# SafeSec Agents — Frontend Implementation Spec (Cursor's scope)

## Role boundary

You own everything under `safesec-agents/frontend/`. You consume the REST + SSE API defined in **API Contract** below, built by a separate agent (Claude) working on `safesec-agents/backend/` at the same time — you won't see its code, only this contract. If the contract seems wrong or incomplete for something the UI needs, don't guess a new field — build against a mock (see **Working before the backend is ready**) and flag the gap.

Do not touch anything under `backend/`, don't implement the judge/attack logic, and don't build the HTML report endpoint (`GET /scans/{id}/report`) — that's server-rendered by the backend; you only need to link to it.

---

## Tech stack

- **Vite + React + TypeScript** — fast dev server, no framework overhead needed for a 4-page app
- **Route-level code splitting** — every page under `src/pages/` is `React.lazy`-loaded from `App.tsx` (wrapped in one top-level `<Suspense>`, see `RouteFallback`), and `Report` (the only thing pulling in Recharts) is further split out of `LiveScan` since it's only needed once a scan completes. Landing on `/` should not pay for Recharts, the Dashboard page, or the live-scan page bytes.
- **Tailwind CSS** — styling
- **Framer Motion** — all animation (enter/exit transitions, stagger, layout animation, `AnimatePresence` for route/state transitions). This is the primary tool for the "next level" feel requested below — don't hand-roll CSS keyframes where Framer Motion covers it.
- **shadcn/ui** (Radix primitives + Tailwind) — for accessible base components (dialog, tooltip, toast, tabs) so polish comes from styling, not from reinventing accessible component behavior
- **`lucide-react`** — icon set (shield, alert-triangle, check-circle, activity, etc. — this app should read as a security tool, lean on shield/lock/alert iconography)
- **`fetch` + `ReadableStream`** for SSE consumption (not the native `EventSource` — the stream is a plain `GET`, but using `fetch` gives you more control over reconnect/error handling; either works against this contract since `GET /scans/{id}/stream` takes no body)
- **Recharts** — category breakdown chart on the report view; animate bar growth on mount (`isAnimationActive` is on by default, keep it)
- **`JetBrains Mono`** (or `Geist Mono`) via `next/font`-style self-hosted or Google Fonts import — used for technical/evidence text and the live feed, paired with **`Inter`** for UI chrome — the monospace-for-technical-content convention is what makes a security tool read as credible rather than generic-SaaS
- No global state library needed — this app is 3 screens with local state; don't add Redux/Zustand unless a screen's state genuinely needs to be shared beyond parent/child props

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
npm install framer-motion recharts lucide-react clsx tailwind-merge
npx shadcn@latest init
```

### Environment variables (`.env.local`)

```
VITE_API_BASE_URL=http://localhost:8000
```

---

## Visual Design System

The product's entire sales mechanic is a live demo where you jailbreak someone's bot in front of them — the UI has to *look* like a security tool a buyer would trust, and the "broke through" moment has to land with visible impact on a shared screen. Treat this as a dark, high-contrast, slightly cinematic security-dashboard aesthetic, not a generic light SaaS admin panel.

**Color system (Tailwind theme extension):**
- Background: near-black (`#0A0B0D` / `zinc-950`), panels a step up (`zinc-900`) with a `1px` `zinc-800` border and subtle `backdrop-blur` (glassmorphism) on floating cards
- Danger/vulnerable (`broke_through: true`): a hot red-to-orange gradient (`#FF3B3B` → `#FF8A00`), used sparingly so it stays alarming — this is the color that should own the "scary" moment
- Safe/resisted (`broke_through: false`): a cool green/cyan (`#10E080` or `emerald-400`), calm and understated by comparison — the contrast between the two is doing the storytelling
- Accent/brand: an electric indigo-to-violet gradient (`#6366F1` → `#A855F7`) for primary buttons, links, focus rings, and the scan-in-progress state
- Severity scale for `RiskBadge` (`low → medium → high → critical`): green → amber → orange → red, each with a matching soft glow (`box-shadow` using the same hue at low opacity), increasing glow intensity with severity

**Typography:** `Inter` for all UI chrome (labels, buttons, nav); `JetBrains Mono` for anything "technical" — attack IDs, technique names, `evidence` text, the target-endpoint field, category codes (`LLM01` etc.). This split alone does most of the work of making the app look purpose-built rather than templated.

**Motion principles (all via Framer Motion):**
- Page/route transitions: `AnimatePresence` with a fade + 8px vertical slide (`opacity 0→1`, `y: 12→0`, ~250ms, `ease: [0.16, 1, 0.3, 1]` — a snappy "ease-out-expo" feel, not a linear/bouncy one)
- Lists (live attack feed, results table): stagger children on mount (`staggerChildren: 0.04`), each item enters with fade + slight slide from the direction new items arrive from
- Micro-interactions: buttons scale to `0.97` on tap (`whileTap`), interactive cards lift slightly on hover (`whileHover={{ y: -2 }}` + shadow increase) — subtle, not cartoonish
- Numbers that change (live counters, progress %) should animate between values (e.g. `framer-motion`'s `useSpring`/`animate()` on a numeric motion value) rather than snapping instantly — this is a small detail that reads as "polished" disproportionately to its effort

**Background texture (optional but recommended for the landing/live-scan screens):** a faint animated grid or scanline effect behind the main content (CSS `background-image` grid pattern with a slow `background-position` keyframe drift, opacity ~5%) reinforces the security/terminal aesthetic without competing with foreground content. Keep it barely-there — it should read as texture, not decoration.

---

## Directory structure

```
frontend/
  src/
    main.tsx
    App.tsx                    # router: / (scan form) -> /scans/:id (live view + report)
    api/
      client.ts                 # typed fetch wrapper for all endpoints in the contract
      sse.ts                     # SSE stream consumer helper (parses "data: ...\n\n" frames)
      types.ts                   # TypeScript types mirroring the Pydantic schemas below
    pages/
      ScanForm.tsx                # landing page: target endpoint / headers / body template inputs
      LiveScan.tsx                 # SSE-driven live attack feed, the "scary demo" screen
      Report.tsx                    # final summary: risk score, category breakdown, results table
    components/
      AttackResultCard.tsx          # one row per attack: technique, category badge, pass/fail — animated mount + glow on broke_through
      RiskBadge.tsx                  # colored badge for low/medium/high/critical, glow intensity scales with severity
      CategoryBreakdownChart.tsx      # bar chart of tested vs broke_through per OWASP category, animated bar growth
      ProgressBar.tsx                 # gradient fill, animated width transition, subtle shimmer while scan is running
      AnimatedCounter.tsx              # spring-animated number for live "N of 50" / "N broke through" stats
      BackgroundGrid.tsx                # faint animated grid/scanline texture, mounted once behind page content
      ui/                                # shadcn primitives (button, badge, tooltip, toast, tabs) — generated via `npx shadcn add <component>`, styled to match the palette above
    mocks/
      mockServer.ts                 # canned SSE event sequence for local dev without a live backend
  index.html
  tailwind.config.js
  .env.local
```

---

## API Contract (identical copy lives in BACKEND.md — do not diverge)

### `POST /scans`

Request body (from the scan form):
```json
{
  "target_name": "My Support Bot",
  "target_endpoint": "https://example.com/api/chat",
  "target_method": "POST",
  "target_headers": { "Authorization": "Bearer sk-..." },
  "target_body_template": { "message": "{{prompt}}" },
  "target_response_path": "reply"
}
```
Response `201`:
```json
{ "scan_id": "scn_8f3a1c", "status": "queued", "total_attacks": 50 }
```
On success, navigate to `/scans/{scan_id}` immediately (don't wait for anything else) — that page opens the SSE stream and shows the live feed from `scan_started` onward.

### `GET /scans/{scan_id}/stream` (SSE)

Connect via `fetch` + a streaming reader (see `api/sse.ts` below). Parse each `data: <json>\n\n` frame. Dispatch on the `type` field:

```ts
type ScanStartedEvent = { type: "scan_started"; scan_id: string; total_attacks: number };

type AttackResultEvent = {
  type: "attack_result";
  attack_id: string;
  category: "LLM01" | "LLM02" | "LLM06" | "LLM07";
  technique: string;
  broke_through: boolean;
  inconclusive: boolean;        // true when we couldn't reach a verdict (see below)
  reason: string | null;        // set when inconclusive: "rate_limited" | "target_unreachable" | "judge_unavailable"
  severity: "critical" | "high" | "medium";
  confidence: number | null;   // 0-1, null when inconclusive
  evidence: string;
  progress: { completed: number; total: number };
};

type AttackErrorEvent = {
  type: "attack_error";
  attack_id: string;
  reason: string;               // e.g. "target_unreachable"
  progress: { completed: number; total: number };
};

type ScanCompleteEvent = {
  type: "scan_complete";
  scan_id: string;
  broke_through_count: number;
  inconclusive_count: number;
  error_count: number;
  risk_score: "low" | "medium" | "high" | "critical";
  duration_ms: number;
};
```
Stream ends with literal `data: [DONE]\n\n` — stop reading on that, don't try to `JSON.parse` it.

**`inconclusive` vs `attack_error`:** an `attack_result` with `inconclusive: true` means the attack was really attempted but we couldn't reach a pass/fail verdict for reasons outside the bot's control (target rate-limited us after every retry, a one-off unreachable response, or the judge itself was down) — `broke_through` is always `false` and `confidence` is always `null`. Render it as a distinct third state (amber/muted, not red or green), showing `reason` instead of `evidence`/`confidence` — don't fold it into either "broke through" or "resisted", and don't silently drop it from counts either. `attack_error` is a separate, rarer event for systemic issues (target confirmed dead for the rest of the scan, or a misconfigured response path) — those never appear in `results` at all.

**UI behavior per event:** `attack_result` → append an `AttackResultCard` to the live feed, animate it in, update the progress bar from `progress`; a `broke_through: true` card should visually read as an alarm (red/critical styling) — this is the sales moment, make it obvious at a glance; an `inconclusive: true` card gets its own amber styling (see above). `attack_error` → append a muted/gray card noting the target was unreachable, don't count it as pass or fail. `scan_complete` → transition the page from "live feed" mode to the `Report` view using the summary fields directly (no need to refetch — you already have everything `GET /scans/{id}` would return, modulo the full `results` array, which you've been accumulating client-side from the `attack_result` events as they streamed in).

### `GET /scans/{scan_id}`

Use this only for the "load a finished scan on page refresh / shared link" case, when you land on `/scans/:id` without having gone through the live stream first (e.g., someone bookmarks the URL). Response shape:

```json
{
  "scan_id": "scn_8f3a1c",
  "target_name": "My Support Bot",
  "status": "complete",
  "started_at": "2026-08-17T10:02:11Z",
  "completed_at": "2026-08-17T10:02:53Z",
  "total_attacks": 50,
  "broke_through_count": 7,
  "inconclusive_count": 2,
  "risk_score": "high",
  "category_breakdown": {
    "LLM01": {"tested": 15, "broke_through": 4, "inconclusive": 1},
    "LLM02": {"tested": 10, "broke_through": 1, "inconclusive": 1},
    "LLM06": {"tested": 10, "broke_through": 2, "inconclusive": 0},
    "LLM07": {"tested": 15, "broke_through": 0, "inconclusive": 0}
  },
  "results": [ { "attack_id": "pi-001", "category": "LLM01", "technique": "direct_override", "broke_through": true, "inconclusive": false, "reason": null, "severity": "high", "confidence": 0.92, "evidence": "..." } ]
}
```
`status` is one of `queued | running | complete | failed`. If `"queued"` or `"running"`, redirect/fall through to opening the SSE stream instead of trying to render a finished report from partial data. If `"failed"`, show an error state ("This scan could not complete — the target may have been unreachable throughout") rather than a report, since `results`/`category_breakdown` may be empty or partial.

### `GET /scans` — dashboard list

Summary list backing the monitoring dashboard, most recent first. Query params: `limit` (default 20, max 200), `offset` (default 0). `Dashboard` fetches 20 at a time and exposes a "Load more" button (`offset = scans.length`) rather than pulling the whole table upfront.

```json
{
  "total": 3,
  "scans": [
    {
      "scan_id": "scn_8f3a1c",
      "target_name": "My Support Bot",
      "status": "complete",
      "started_at": "2026-08-17T10:02:11Z",
      "completed_at": "2026-08-17T10:02:53Z",
      "total_attacks": 50,
      "broke_through_count": 7,
      "inconclusive_count": 2,
      "error_count": 1,
      "risk_score": "high",
      "duration_ms": 41230
    }
  ]
}
```
Poll this on the `Dashboard` page every ~5s while any returned scan is `queued`/`running` (it's a list view, not a stream — no SSE endpoint exists for the list itself). `risk_score`/`duration_ms` are `null` for scans that haven't completed yet.

### `GET /scans/{scan_id}/report`

Backend-rendered HTML. Just link/open it (`<a href={`${API_BASE}/scans/${id}/report`} target="_blank">Download report</a>`) — don't fetch and re-render its contents client-side.

### Errors

Non-2xx responses return `{"detail": "<message>"}`. Render `detail` directly in a dismissible error banner; don't expose raw fetch/network errors to the user.

---

## Screens

**`ScanForm` (`/`)** — target name, endpoint URL, method (default POST), optional headers (key/value pairs, at least one row for an `Authorization` field), a JSON body template textarea pre-filled with `{"message": "{{prompt}}"}`, and a text input for `target_response_path` (default `"reply"`) with inline help text ("dot-path to the reply text in your bot's JSON response, e.g. `choices.0.message.content`"). Hero copy should sell the scan itself ("50 jailbreak attacks. 60 seconds. See if your bot breaks."), sitting over the faint `BackgroundGrid`, with the primary submit button using the indigo/violet gradient and a hover glow. A small "View past scans" link under the hero copy goes to `/dashboard`. Submit → `POST /scans` → `AnimatePresence` fade/slide into `/scans/:id`.

**`LiveScan` (`/scans/:id`, while streaming)** — this is the demo screen, design it to read well projected on a shared screen: `ProgressBar` with animated gradient fill, `AnimatedCounter`-driven running stats ("7 of 50 attacks — 2 broke through — 1 inconclusive"), a scrolling feed of `AttackResultCard`s entering with staggered fade+slide as SSE events land, most recent on top. A `broke_through: true` card is the money moment — give it a distinct entrance (slightly larger scale-in, red/orange glow pulsing once or twice via a `keyframes` animation, not looping indefinitely) so it visibly punches through the rest of the feed rather than just being another list item in a different color. `inconclusive: true` cards get their own amber, non-alarming styling — they're neither a win nor a loss. `attack_error` cards stay muted/gray with no glow, clearly de-emphasized.

**`Report` (`/scans/:id`, after `scan_complete` or on load-of-finished-scan)** — page transitions in via `AnimatePresence` from the live view. `RiskBadge` at top scales/pops in on mount (spring easing), with its glow intensity matching severity — a `critical` badge should feel like the visual climax of the page. Stat row includes a dedicated "Inconclusive" card alongside attacks/broke-through/errors/duration. `CategoryBreakdownChart` bars animate growing in on scroll-into-view (Framer Motion's `whileInView`), with a third amber series for `inconclusive` alongside `tested`/`broke_through`. A filterable table of all results (filter by category / broke-through-only / inconclusive-only, filter changes animate row add/remove via `layout` prop rather than snapping), and the "Download full report" link to the backend's HTML report endpoint.

**`Dashboard` (`/dashboard`)** — the monitoring/overview screen: a stat row (total scans, total attacks run, overall breakthrough rate, currently-running count), then a searchable/filterable list of all scans backed by `GET /scans` (search by target name, tabs to filter by risk level). Each row shows target name, scan id, a status dot (queued/running/complete/failed), `RiskBadge` (or a dash if not yet scored), broke-through/inconclusive/error counts, duration, and relative time, linking into the existing `/scans/:id` route. Polls `GET /scans` every ~5s while any listed scan is `queued`/`running`. Linked from `AppHeader` (persistent nav) and from `ScanForm`'s "View past scans".

---

## Working before the backend is ready

Don't block on the backend being live. Build `mocks/mockServer.ts` — a function that replays a canned sequence of the exact event shapes above with `setTimeout` delays, matching one `scan_started`, ~50 `attack_result`/`attack_error` events (mix of true/false `broke_through`, plus a couple marked `inconclusive` with a `reason` so that state gets exercised too), then `scan_complete`. Also mock `GET /scans` (`mockListScans()`, reading every scan out of the same in-memory/sessionStorage store) so `Dashboard` works fully offline. Gate it behind `import.meta.env.VITE_USE_MOCK === "true"` in `.env.local`, so switching to the real backend later is a one-line env change, not a code change. Build and polish the entire UI against this mock first; only flip to the live backend to verify integration once both sides are ready.

---

## Verification before calling this done

- Full flow works end-to-end against the mock: form submit → live feed animates in → report renders with correct risk badge color and chart.
- Manually point `VITE_API_BASE_URL` at a running backend instance and confirm the same flow works against real SSE data (event ordering, `[DONE]` termination, no dropped events on fast bursts).
- Error states: submit an invalid/unreachable `target_endpoint` and confirm the error banner shows the backend's `detail` message, not a raw exception.
- Responsive check at typical demo resolution (this app's main purpose is being shown live on a call/screen-share) — text and badges should be legible at a glance, not just on close inspection.
- Animation pass: confirm route transitions, feed stagger, animated counters/progress, and the `broke_through` glow moment are all present and running at 60fps (no jank from animating layout-affecting properties — animate `transform`/`opacity`, not `width`/`top` directly, except where noted for the progress bar fill). Nothing should loop indefinitely or distract from reading the content — motion should punctuate state changes, not run continuously in the background beyond the faint grid texture.
