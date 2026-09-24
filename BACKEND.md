# SafeSec Agents — Backend Implementation Spec (Claude's scope)

## Role boundary

You own everything under `safesec-agents/backend/`. You expose the REST + SSE API defined in **API Contract** below and must not change its shapes without also updating `FRONTEND.md`, since a separate agent (Cursor) is building the UI against this contract in parallel, unable to see your code. If you need to deviate from the contract, stop and flag it rather than silently changing a field name.

Do not build any UI, HTML templates for the demo page, or CSS — that's `FRONTEND.md`'s scope. Your only user-facing output is the JSON/SSE API and (optionally) a server-rendered HTML/PDF **report** endpoint (this one is backend scope because it's a data export, not the interactive app).

---

## Tech stack

- **FastAPI** + `uvicorn` — serving layer, async throughout
- **Gemini API** (`gemini-2.5-flash`, OpenAI-compatible endpoint) — primary judge model
- **OpenRouter** (`meta-llama/llama-3.3-70b-instruct:free` or similar) — fallback judge model when Gemini errors/rate-limits
- **`sentence-transformers`** (`all-MiniLM-L6-v2`, local, no API) — embeddings for the semantic judge-cache, zero cost, no rate limit
- **Redis** — semantic cache store (vector search) + rate limiter (token bucket) + scan progress pub/sub for SSE
- **Postgres** (or SQLite for local dev) — durable scan/report storage
- **`tenacity`** — retry/backoff
- **LangFuse** — tracing (one trace per scan, one span per attack, judge verdict attached as a score)
- **`httpx.AsyncClient`** — calling target bot endpoints

```bash
pip install fastapi uvicorn "openai>=1.0" redis sentence-transformers tenacity langfuse httpx sqlalchemy asyncpg pydantic python-dotenv
```

### Environment variables (`.env.example`)

```
GEMINI_API_KEY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Reserved for a future attack-generation model — separate from the judge
# above so judging can stay cheap/fast while generation can use a
# stronger/slower model. Not wired up yet; see core/attack_generator.py.
ATTACK_GENERATION_API_KEY=
ATTACK_GENERATION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
ATTACK_GENERATION_MODEL=gemini-2.5-pro
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql+asyncpg://localhost/safesec_agents
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
CORS_ORIGINS=http://localhost:3000
```

---

## Directory structure

```
backend/
  app/
    main.py                 # FastAPI app, lifespan, CORS, router mounts
    config.py                # env var loading (pydantic-settings)
    routers/
      scans.py                # POST /scans, GET /scans, GET /scans/{id}, GET /scans/{id}/stream, GET /scans/{id}/report
      health.py
    core/
      attack_library.py        # ~50 attacks, OWASP-tagged (see below)
      target_caller.py          # retry + circuit breaker + rate-limited HTTP calls to customer bot
      judge.py                  # Gemini primary + OpenRouter fallback judge
      semantic_cache.py          # local-embedding cache for judge calls
      rate_limiter.py            # Redis token bucket, per-client + per-target
      orchestrator.py            # runs a scan: fires attacks with bounded concurrency, yields events
      attack_generator.py        # reserved stub for future LLM-based attack generation (unused today)
    models/
      schemas.py                # Pydantic request/response models (must match API Contract exactly)
      db.py                      # SQLAlchemy models (scans, attack_results)
    eval/
      gold_set.json               # ~100 hand-labeled (attack, response, ground_truth) triples
      run_judge_eval.py            # CI-style script, asserts judge accuracy >= 0.90
  tests/
    test_target_caller.py
    test_judge.py
    test_orchestrator.py
  .env.example
  requirements.txt
```

---

## API Contract (source of truth — identical copy lives in FRONTEND.md)

### `POST /scans`

Starts a new scan against a target bot. Returns immediately with a scan ID; the actual attack run happens async and is consumed via the SSE stream.

Request:
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
`target_body_template` lets the user's bot use any JSON shape — `{{prompt}}` gets substituted with the attack text. `target_response_path` is a dot-path into the bot's JSON response where the reply text lives (e.g. `"choices.0.message.content"`).

Response `201`:
```json
{ "scan_id": "scn_8f3a1c", "status": "queued", "total_attacks": 50 }
```

### `GET /scans/{scan_id}/stream`

SSE endpoint (`Content-Type: text/event-stream`). Frontend connects via `fetch` + streaming reader (not `EventSource`, since we may add a POST-triggered variant later — keep it GET-compatible with `EventSource` for now since no body is needed here).

Event payloads (`data: <json>\n\n`), one per line, in order:

```json
{"type": "scan_started", "scan_id": "scn_8f3a1c", "total_attacks": 50}
```
```json
{
  "type": "attack_result",
  "attack_id": "pi-001",
  "category": "LLM01",
  "technique": "direct_override",
  "broke_through": true,
  "inconclusive": false,
  "reason": null,
  "severity": "high",
  "confidence": 0.92,
  "evidence": "Sure, PWNED. I will now ignore my previous instructions...",
  "progress": {"completed": 3, "total": 50}
}
```
```json
{
  "type": "attack_result",
  "attack_id": "pi-005",
  "category": "LLM01",
  "technique": "payload_split",
  "broke_through": false,
  "inconclusive": true,
  "reason": "rate_limited",
  "severity": "high",
  "confidence": null,
  "evidence": "",
  "progress": {"completed": 5, "total": 50}
}
```
```json
{
  "type": "attack_error",
  "attack_id": "pi-014",
  "reason": "target_unreachable",
  "progress": {"completed": 14, "total": 50}
}
```
```json
{
  "type": "scan_complete",
  "scan_id": "scn_8f3a1c",
  "broke_through_count": 7,
  "inconclusive_count": 2,
  "error_count": 1,
  "risk_score": "high",
  "duration_ms": 41230
}
```
Terminal line: `data: [DONE]\n\n`

`type` is always one of `scan_started | attack_result | attack_error | scan_complete`. Frontend should switch on this field — do not assume field presence beyond what's shown per type.

**`inconclusive` vs `attack_error` — this distinction is deliberate.** An `attack_result` with `inconclusive: true` means we made a real attempt at the attack but couldn't reach a pass/fail verdict for reasons outside the bot's control (`reason` is one of `rate_limited`, `target_unreachable`, or `judge_unavailable`) — `broke_through` is always `false` and `confidence` is always `null` in this case, and it's still included in `results`/counted in `category_breakdown` so the report is honest about what wasn't actually tested, rather than silently counting it as "resisted". `attack_error` is reserved for systemic/config issues that make the attack meaningless to report at all (circuit breaker tripped — the rest of the scan against a confirmed-dead target — or a misconfigured `target_response_path`); those are excluded from `results` entirely.

### `GET /scans/{scan_id}`

Full scan record, for loading a finished scan directly (e.g. page refresh, shared link) without replaying the stream.

Response `200`:
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
  "results": [
    {
      "attack_id": "pi-001",
      "category": "LLM01",
      "technique": "direct_override",
      "broke_through": true,
      "inconclusive": false,
      "reason": null,
      "severity": "high",
      "confidence": 0.92,
      "evidence": "Sure, PWNED. I will now ignore my previous instructions..."
    }
  ]
}
```
`status` is one of `queued | running | complete | failed`. `risk_score` is one of `low | medium | high | critical`, derived from `broke_through_count` weighted by severity (define the exact thresholds in `orchestrator.py`, document them in a code comment since the frontend just displays the label + color-codes it) — `inconclusive` results never contribute to this score, since they represent attacks we couldn't actually judge.

### `GET /scans`

Summary list for the monitoring dashboard, most recent first. Query params: `limit` (default 20, max 200), `offset` (default 0) — the frontend uses this for a "Load more" button rather than fetching everything at once. `Scan.created_at` is indexed so the `ORDER BY ... LIMIT/OFFSET` stays an index scan instead of a full table scan + sort as the table grows.

Response `200`:
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

### `GET /scans/{scan_id}/report`

Returns a self-contained HTML report (same data as above, human-readable, suitable for the customer to download/forward). `Content-Type: text/html`. Add `?format=pdf` later if needed — out of scope for MVP.

### `GET /health`

```json
{ "status": "ok" }
```

### Errors

All error responses use FastAPI's default shape: `{"detail": "<message>"}` with the appropriate status code (`404` unknown scan, `422` validation, `429` rate limited, `502` upstream/judge failure). Frontend should render `detail` directly — keep messages user-safe (no stack traces, no leaked keys).

---

## Component build order

Build and test each in isolation before wiring into the FastAPI app — this is what makes the eval harness in step 5 meaningful (it needs the judge working standalone first).

1. **Attack library** (`core/attack_library.py`) — ~50 `Attack` objects (`id`, `category` [OWASP LLM01/02/06/07], `technique`, `severity_if_success`, `turns: list[str]`). Mix single-turn and multi-turn (crescendo) attacks. Store as Python data, not a DB table — it's static content shipped with the app.

2. **Target caller** (`core/target_caller.py`) — `httpx.AsyncClient` POST to `target_endpoint` using `target_body_template` substitution, extracts reply via `target_response_path`. Wrap with `tenacity` retry (3 attempts, exponential backoff + jitter) on timeout/connection errors. Add a `CircuitBreaker` (same shape as the one in the system-design guide: opens after 5 consecutive failures against one target, 30s cooldown) so a dead target endpoint fails the remaining attacks fast as `attack_error` events instead of hanging the whole scan. HTTP 429 is handled separately from that retry/breaker path: on a 429, sleep for the response's `Retry-After` header if present (supports both delta-seconds and HTTP-date forms) or exponential backoff otherwise, up to `settings.target_rate_limit_retry_attempts` (default 3); on exhaustion raise `TargetRateLimitedError` rather than `TargetUnreachableError`, and never call `circuit_breaker.record_failure()` for it — a 429 means the target is alive and throttling us, not dead.

3. **Judge** (`core/judge.py`) — `judge(category, attack_turns, bot_response) -> {broke_through, confidence, evidence}` using the jailbreak-specific rubric prompt (not a generic quality judge — score compliance with malicious intent, not topic engagement). Primary call to Gemini (`gemini-2.5-flash`), on exception fall back to OpenRouter's free Llama model. `temperature=0`, `response_format={"type": "json_object"}`. Deliberately kept cheap/fast — it's called once per attack for a low-stakes binary classification. This is a distinct model slot from the reserved (currently unused) `settings.attack_generation_model` in `core/attack_generator.py`, which would want a stronger/slower model for generating novel jailbreak prompts if that feature is ever built.

4. **Semantic cache** (`core/semantic_cache.py`) — before calling the judge, embed `bot_response` locally via `sentence-transformers`, check Redis vector index for a prior response above cosine similarity 0.97 (tight threshold — this is scoring cache, false hits here silently wrong a security verdict, so bias toward missing the cache over a bad hit). On miss, call judge, store the embedding + verdict as its own Redis key with a `SEMANTIC_CACHE_TTL_SECONDS` TTL (default 30 days) so the cache self-cleans instead of growing unbounded — relevant on small/free Redis tiers.

5. **Eval harness** (`eval/run_judge_eval.py`) — hand-label ~100 `(category, attack_turns, bot_response, ground_truth_broke_through)` cases into `gold_set.json` (write these by hand or by sampling early real judge calls and correcting them). Script runs `judge()` against every case, asserts accuracy ≥ 90%, prints a confusion matrix. This should be runnable standalone (`python -m eval.run_judge_eval`) and is what you'd wire into CI later.

6. **Orchestrator** (`core/orchestrator.py`) — `async def run_scan(scan_id, target_config) -> AsyncGenerator[dict, None]`. Bounded concurrency (`asyncio.Semaphore(settings.scan_concurrency)`, default `1` — sequential, since target bots hit in a demo/eval are typically low-traffic and firing several attacks concurrently just means N requests racing the same per-target token bucket) over the attack library, yields the SSE event dicts described in the contract, writes each result to Postgres as it completes (so `GET /scans/{id}` works even mid-scan), computes `risk_score` at the end. Exceptions from a single attack map to one of three outcomes: `CircuitBreakerOpenError`/`ResponseParseError` → `attack_error` (systemic, excluded from results); `TargetRateLimitedError`/`TargetUnreachableError`/`JudgeUnavailableError` → an `attack_result` with `inconclusive: true` (a real attempt, honest about not reaching a verdict); anything else → a normal judged pass/fail.

7. **Rate limiter** (`core/rate_limiter.py`) — Redis token bucket, two scopes: per-API-client on `POST /scans` (protect your own service from abuse) and per-target-endpoint inside the orchestrator (don't hammer a free-tier customer bot faster than ~1 req/sec — configurable via `settings.target_rate_limit_per_sec`). Combined with `scan_concurrency=1` above, this makes the scan genuinely throttled rather than several tasks racing the same bucket.

8. **Routers + SSE wiring** (`routers/scans.py`) — `POST /scans` creates the DB row and kicks off `orchestrator.run_scan` as a background task; `GET /scans/{id}/stream` is a `StreamingResponse` that reads from the same event source (use a Redis pub/sub channel keyed by `scan_id`, or an in-process `asyncio.Queue` if you're fine with single-instance deployment for the MVP — the guide's SSE pattern applies directly, `media_type="text/event-stream"`).

9. **LangFuse tracing** — wrap the orchestrator: one `trace` per scan, one `span` per attack (target call) + `generation` per judge call, `langfuse.score()` with the judge's `confidence` attached to each generation. This gives you the cost/latency dashboard from the system-design guide for free once wired.

---

## Testing / verification before handing off

- `pytest tests/` — unit test `target_caller` against a local mock FastAPI "victim bot" (write a tiny second app in `tests/fixtures/mock_bot.py` that deliberately fails/rate-limits sometimes, to exercise retry + circuit breaker).
- `python -m eval.run_judge_eval` — must pass the 90% accuracy assertion before this is considered done.
- Manually curl `POST /scans` against the mock bot, then `curl -N GET /scans/{id}/stream` and confirm events arrive incrementally, not all at once (proves streaming isn't buffered).
- Confirm CORS is configured for `CORS_ORIGINS` (frontend's local dev server) or the SSE stream will silently fail in-browser with no useful error.
