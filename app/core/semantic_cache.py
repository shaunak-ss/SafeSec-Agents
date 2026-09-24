"""Local-embedding semantic cache for judge verdicts.

Before calling the (paid/rate-limited) judge model, embed the bot's
response locally with sentence-transformers and check Redis for a prior
response above `SEMANTIC_CACHE_THRESHOLD` cosine similarity, scoped per
attack category (a response that resisted an LLM06 leak attempt is not a
valid cache hit for an LLM07 excessive-agency attempt, even if the text is
similar).

The threshold defaults to 0.97 — deliberately tight, since a false hit
here silently mis-scores a security verdict, so we bias toward missing the
cache over a bad hit. Similarity is computed by brute-force cosine over
entries stored per-category (fine at demo scale: at most a few hundred
entries per category per scan); this is not a real vector index, and swaps
for RediSearch/pgvector if this ever needs to scale past that.

Each entry is its own Redis key (`{namespace}:{category}:{entry_id}`) with
a TTL (`SEMANTIC_CACHE_TTL_SECONDS`, default 30 days) set at write time and
never refreshed, so growth is self-bounding — this matters on small/free
Redis tiers (e.g. a 30 MB plan), since without it this cache would grow
forever with no eviction. Reads use SCAN + MGET rather than a single HASH
key so each entry can expire independently; this is one Redis round trip
per unique key found (cheap at the entry counts this is designed for).
"""

import asyncio
import json
import uuid

import redis.asyncio as redis
from sentence_transformers import SentenceTransformer

from app.config import settings

_EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None
# Guards both model loading AND every encode() call. torch's CPU backend
# isn't safe to enter concurrently from multiple threads on all platforms
# (observed a hard segfault under `asyncio.Semaphore(5)` concurrency without
# this) — the local model is small enough that serializing embedding calls
# process-wide costs little and buys correctness.
_model_lock = asyncio.Lock()


async def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = await asyncio.to_thread(SentenceTransformer, _EMBED_MODEL_NAME)
    return _model


async def _embed(text: str) -> list[float]:
    async with _model_lock:
        model = await _get_model()
        vector = await asyncio.to_thread(model.encode, text, normalize_embeddings=True)
    return vector.tolist()


def _cosine(a: list[float], b: list[float]) -> float:
    # both vectors are pre-normalized at embed time, so this is just the dot product
    return sum(x * y for x, y in zip(a, b, strict=True))


class SemanticCache:
    def __init__(
        self,
        redis_client: redis.Redis,
        threshold: float = settings.semantic_cache_threshold,
        namespace: str = "judge_cache",
        ttl_seconds: int = settings.semantic_cache_ttl_seconds,
    ):
        self._redis = redis_client
        self.threshold = threshold
        self.namespace = namespace
        self.ttl_seconds = ttl_seconds

    def _pattern(self, category: str) -> str:
        return f"{self.namespace}:{category}:*"

    def _key(self, category: str, entry_id: str) -> str:
        return f"{self.namespace}:{category}:{entry_id}"

    async def get(self, category: str, bot_response: str) -> dict | None:
        embedding = await _embed(bot_response)

        keys = [key async for key in self._redis.scan_iter(match=self._pattern(category), count=200)]
        if not keys:
            return None
        raw_entries = await self._redis.mget(keys)

        best_sim = -1.0
        best_verdict: dict | None = None
        for raw in raw_entries:
            if raw is None:
                # Expired/evicted between the SCAN and this MGET — skip rather than error.
                continue
            entry = json.loads(raw)
            sim = _cosine(embedding, entry["embedding"])
            if sim > best_sim:
                best_sim = sim
                best_verdict = entry["verdict"]

        if best_verdict is not None and best_sim >= self.threshold:
            return best_verdict
        return None

    async def set(self, category: str, bot_response: str, verdict: dict) -> None:
        embedding = await _embed(bot_response)
        entry_id = uuid.uuid4().hex
        payload = json.dumps({"embedding": embedding, "verdict": verdict})
        await self._redis.set(self._key(category, entry_id), payload, ex=self.ttl_seconds)
