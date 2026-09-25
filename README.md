# SafeSec Agents — backend

FastAPI service that runs a library of ~50 OWASP-tagged prompt-injection
attacks against a customer's chat bot endpoint and judges whether each one
broke through. Full spec: [BACKEND.md](BACKEND.md). API contract is shared
verbatim with the frontend (`FRONTEND.md` in the sibling `frontend/` repo).

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in GEMINI_API_KEY / OPENROUTER_API_KEY
```

Requires a running Redis (`REDIS_URL`) for the semantic cache and rate
limiters. Postgres is optional — `DATABASE_URL` defaults to a local SQLite
file, which is enough for dev.

```bash
uvicorn app.main:app --reload
```

## Testing

```bash
pytest tests/                      # unit tests, no external services needed
cd app && python -m eval.run_judge_eval   # needs real GEMINI_API_KEY/OPENROUTER_API_KEY in .env
```

The eval harness asserts judge accuracy ≥ 90% against `app/eval/gold_set.json`
(102 hand-labeled cases) and prints a confusion matrix. It was not run
against a live model as part of this build — no API keys were available in
this environment — but the judge's Gemini→OpenRouter fallback path was
verified live against the real APIs (both correctly rejected the placeholder
key and `JudgeUnavailableError` was raised as expected). Run it yourself
once real keys are in `.env`, and treat that as the actual gate before
shipping — expand the gold set from real judge calls per the spec if it
falls short of 90%.

## Manual smoke test

```bash
# terminal 1
uvicorn tests.fixtures.mock_bot:app --port 8199

# terminal 2
uvicorn app.main:app --port 8123

# terminal 3
curl -X POST localhost:8123/scans -H "Content-Type: application/json" -d '{
  "target_name": "Mock Bot",
  "target_endpoint": "http://127.0.0.1:8199/chat",
  "target_body_template": {"message": "{{prompt}}"},
  "target_response_path": "reply"
}'
curl -N localhost:8123/scans/<scan_id>/stream
```

This full flow (POST /scans → incremental SSE stream → GET /scans → GET
/scans/{id} → GET /scans/{id}/report → CORS headers → 404 handling) was
verified during development. Judge calls will fail with `inconclusive:
true, reason: "judge_unavailable"` `attack_result` events until real API
keys are configured — that's expected and still proves the rest of the
pipeline (target calling, retry/circuit breaker, concurrency, DB
persistence, SSE streaming, risk scoring) end-to-end.

## Known gaps / follow-ups

- `eval/gold_set.json` has 102 cases, hand-authored rather than sampled
  from live judge calls (no live traffic existed yet at build time). Worth
  revisiting once real scans have run, per the spec's suggestion.
- Rate limiting and SSE fan-out are both in-process/single-Redis-instance
  MVP choices (explicitly allowed by the spec) — revisit if this ever runs
  as more than one process.
- `core/attack_generator.py` is a reserved-but-unimplemented seam for a
  future LLM-based attack-generation feature — `settings.attack_generation_*`
  is configured but nothing calls into it yet; the attack library is still
  fully static.
