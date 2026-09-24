"""Calls the customer's target bot endpoint with retry + circuit breaking.

Substitutes `{{prompt}}` into `target_body_template`, POSTs (or whatever
`target_method` is) to `target_endpoint`, and extracts the reply text via
`target_response_path` (a dot-path, numeric segments index into lists).
"""

import asyncio
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)


class TargetUnreachableError(Exception):
    """Target endpoint could not be reached after retries."""


class ResponseParseError(Exception):
    """Target responded but `target_response_path` didn't resolve."""


class CircuitBreakerOpenError(Exception):
    """Circuit breaker is open for this target; call was short-circuited."""


class TargetRateLimitedError(Exception):
    """Target responded 429 and kept doing so after every retry attempt.

    Deliberately distinct from `TargetUnreachableError`: a 429 means the
    target is alive and simply throttling us, not dead, so callers should
    not treat this the same as a connectivity failure (in particular, the
    circuit breaker should not trip on it)."""


def _parse_retry_after(response: httpx.Response) -> float | None:
    """Parse a `Retry-After` header (RFC 9110 §10.2.3), which may be either
    an integer number of seconds or an HTTP-date. Returns None if the
    header is missing or unparseable, so the caller can fall back to plain
    exponential backoff."""
    header = response.headers.get("retry-after")
    if not header:
        return None
    header = header.strip()
    try:
        return max(0.0, float(header))
    except ValueError:
        pass
    try:
        retry_at = parsedate_to_datetime(header)
    except (TypeError, ValueError):
        return None
    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=timezone.utc)
    return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())


@dataclass
class TargetConfig:
    target_endpoint: str
    target_method: str = "POST"
    target_headers: dict[str, str] | None = None
    target_body_template: dict | None = None
    target_response_path: str = "reply"


def substitute_template(node: Any, prompt: str) -> Any:
    """Recursively replace the `{{prompt}}` placeholder anywhere in the
    body template with the actual attack text."""
    if isinstance(node, str):
        return node.replace("{{prompt}}", prompt)
    if isinstance(node, dict):
        return {k: substitute_template(v, prompt) for k, v in node.items()}
    if isinstance(node, list):
        return [substitute_template(v, prompt) for v in node]
    return node


def extract_path(data: Any, path: str) -> str:
    """Resolve a dot-path like `choices.0.message.content` into `data`."""
    current = data
    for segment in path.split("."):
        if isinstance(current, list):
            try:
                idx = int(segment)
            except ValueError as e:
                raise ResponseParseError(
                    f"expected list index at '{segment}', got non-integer"
                ) from e
            try:
                current = current[idx]
            except IndexError as e:
                raise ResponseParseError(f"list index {idx} out of range") from e
        elif isinstance(current, dict):
            if segment not in current:
                raise ResponseParseError(f"key '{segment}' not found in response")
            current = current[segment]
        else:
            raise ResponseParseError(
                f"cannot descend into '{segment}': not a dict/list at this point"
            )
    return str(current)


class CircuitBreaker:
    """Opens after `failure_threshold` consecutive failures, half-opens
    after `cooldown_sec`."""

    def __init__(self, failure_threshold: int = 5, cooldown_sec: float = 30.0):
        self.failure_threshold = failure_threshold
        self.cooldown_sec = cooldown_sec
        self._consecutive_failures = 0
        self._opened_at: float | None = None

    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        if time.monotonic() - self._opened_at >= self.cooldown_sec:
            return False  # half-open: let the next call through as a trial
        return True

    def record_success(self) -> None:
        self._consecutive_failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.failure_threshold:
            self._opened_at = time.monotonic()


class TargetCaller:
    """One instance per scan — holds the circuit breaker state and HTTP
    client for the lifetime of a single scan run against one target."""

    def __init__(
        self,
        config: TargetConfig,
        failure_threshold: int = 5,
        cooldown_sec: float = 30.0,
        timeout_sec: float = 15.0,
        rate_limit_retry_attempts: int = 3,
    ):
        self.config = config
        self.circuit_breaker = CircuitBreaker(failure_threshold, cooldown_sec)
        self._client = httpx.AsyncClient(timeout=timeout_sec)
        self.rate_limit_retry_attempts = max(1, rate_limit_retry_attempts)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def call(self, prompt: str) -> str:
        if self.circuit_breaker.is_open():
            raise CircuitBreakerOpenError(
                f"circuit breaker open for {self.config.target_endpoint}"
            )
        try:
            reply = await self._call_with_rate_limit_retry(prompt)
        except CircuitBreakerOpenError:
            raise
        except TargetRateLimitedError:
            # The target is alive and simply throttling us, not dead — a
            # 429 should never count as a circuit-breaker failure.
            raise
        except Exception as e:
            self.circuit_breaker.record_failure()
            if isinstance(e, ResponseParseError):
                raise
            raise TargetUnreachableError(str(e)) from e
        else:
            self.circuit_breaker.record_success()
            return reply

    async def _call_with_rate_limit_retry(self, prompt: str) -> str:
        """Wraps `_call_with_retry` (which already handles connection-level
        retries) with a separate retry loop for HTTP 429s specifically,
        since those need a dynamic wait (`Retry-After`) rather than plain
        exponential backoff, and shouldn't count as a connectivity
        failure."""
        attempt = 0
        while True:
            try:
                return await self._call_with_retry(prompt)
            except httpx.HTTPStatusError as e:
                if e.response.status_code != 429:
                    raise
                attempt += 1
                if attempt >= self.rate_limit_retry_attempts:
                    raise TargetRateLimitedError(
                        f"target rate-limited us {attempt} time(s) in a row "
                        f"for {self.config.target_endpoint}"
                    ) from e
                delay = _parse_retry_after(e.response)
                if delay is None:
                    delay = min(8.0, 0.5 * (2**attempt)) + random.uniform(0, 0.25)
                await asyncio.sleep(delay)

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=0.5, max=8),
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
    )
    async def _call_with_retry(self, prompt: str) -> str:
        body = substitute_template(self.config.target_body_template or {}, prompt)
        response = await self._client.request(
            self.config.target_method,
            self.config.target_endpoint,
            json=body,
            headers=self.config.target_headers or {},
        )
        response.raise_for_status()
        data = response.json()
        return extract_path(data, self.config.target_response_path)
