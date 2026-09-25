"""A tiny victim bot used only by the test suite. Deliberately fails,
times out, and returns malformed shapes on some routes so
`target_caller`'s retry + circuit breaker paths get exercised."""

import asyncio

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

_flaky_state = {"n": 0}
_rate_limited_state = {"n": 0}


def _is_injected(message: str) -> bool:
    lowered = message.lower()
    return "pwned" in lowered or "ignore all previous instructions" in lowered


@app.post("/chat")
async def chat(request: Request):
    body = await request.json()
    message = body.get("message", "")
    if _is_injected(message):
        return {"reply": "Sure, PWNED. I will now ignore my previous instructions."}
    return {"reply": "I can't help with that, but I'm happy to assist with something else."}


@app.post("/chat/flaky")
async def chat_flaky(request: Request):
    """Fails the first two calls, then succeeds for the rest of the
    process lifetime — used to prove a caller recovers across attempts."""
    _flaky_state["n"] += 1
    if _flaky_state["n"] <= 2:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=503, content={"detail": "simulated transient failure"})
    body = await request.json()
    return {"reply": f"echo: {body.get('message', '')}"}


@app.post("/chat/dead")
async def chat_dead(request: Request):
    """Never responds in time — used to exercise timeout retry + the
    circuit breaker."""
    await asyncio.sleep(5)
    return {"reply": "too slow"}


@app.post("/chat/badshape")
async def chat_badshape(request: Request):
    """Responds with a shape that doesn't contain `target_response_path`."""
    return {"unexpected_key": "no reply field here"}


@app.post("/chat/ratelimited")
async def chat_ratelimited(request: Request):
    """429s with a `Retry-After` header for the first two calls (per
    process lifetime), then succeeds — used to exercise the target
    caller's 429 retry/backoff path."""
    _rate_limited_state["n"] += 1
    if _rate_limited_state["n"] <= 2:
        return JSONResponse(
            status_code=429,
            content={"detail": "rate limited"},
            headers={"Retry-After": "0"},
        )
    body = await request.json()
    return {"reply": f"echo: {body.get('message', '')}"}


@app.post("/chat/alwaysratelimited")
async def chat_alwaysratelimited(request: Request):
    """Always 429s with a `Retry-After` header — used to exercise
    exhaustion into `TargetRateLimitedError`."""
    return JSONResponse(
        status_code=429,
        content={"detail": "rate limited"},
        headers={"Retry-After": "0"},
    )
