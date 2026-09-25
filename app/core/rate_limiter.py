"""Redis token bucket rate limiter, two scopes:

- per-API-client, enforced in `routers/scans.py` on `POST /scans` (protects
  our own service from abuse)
- per-target-endpoint, enforced inside the orchestrator so we don't hammer
  a customer's (possibly free-tier) bot faster than ~1 req/sec
"""

import asyncio
import time

import redis.asyncio as redis

from app.config import settings

# Atomic refill + consume so concurrent requests can't race the bucket.
_TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local delta = math.max(0, now - ts)
tokens = math.min(capacity, tokens + delta * refill_rate)

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, 3600)

return allowed
"""


class RateLimitExceededError(Exception):
    pass


class TokenBucketRateLimiter:
    def __init__(
        self,
        redis_client: redis.Redis,
        capacity: float,
        refill_rate: float,
        namespace: str,
    ):
        self._redis = redis_client
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.namespace = namespace
        self._script = redis_client.register_script(_TOKEN_BUCKET_LUA)

    async def allow(self, key: str, cost: float = 1.0) -> bool:
        now = time.time()
        result = await self._script(
            keys=[f"{self.namespace}:{key}"],
            args=[self.capacity, self.refill_rate, now, cost],
        )
        return bool(int(result))

    async def acquire(self, key: str, cost: float = 1.0) -> None:
        """Raise if a token isn't immediately available (used for the
        client-facing limiter — a rejected request should surface as 429)."""
        if not await self.allow(key, cost):
            raise RateLimitExceededError(f"rate limit exceeded for '{key}'")

    async def wait(self, key: str, cost: float = 1.0, poll_interval: float = 0.1) -> None:
        """Block until a token is available (used for the per-target
        limiter — attacks should throttle, not fail, when the target is
        being called faster than its configured rate)."""
        while not await self.allow(key, cost):
            await asyncio.sleep(poll_interval)


def client_rate_limiter(redis_client: redis.Redis) -> TokenBucketRateLimiter:
    per_min = settings.client_rate_limit_per_min
    return TokenBucketRateLimiter(
        redis_client,
        capacity=per_min,
        refill_rate=per_min / 60.0,
        namespace="ratelimit:client",
    )


def target_rate_limiter(redis_client: redis.Redis) -> TokenBucketRateLimiter:
    per_sec = settings.target_rate_limit_per_sec
    return TokenBucketRateLimiter(
        redis_client,
        capacity=max(1.0, per_sec),
        refill_rate=per_sec,
        namespace="ratelimit:target",
    )
