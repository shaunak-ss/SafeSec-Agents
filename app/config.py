from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    gemini_model: str = "gemini-2.5-flash"

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"

    # Reserved for a future LLM-based attack-generation feature (today the
    # attack library in `core/attack_library.py` is static, hand-authored
    # data — nothing calls these yet). Deliberately a separate model slot
    # from the judge above: judging should stay on a cheap/fast model
    # (low-stakes classification, called once per attack), while
    # generation would want a stronger/slower model for creative, novel
    # jailbreak prompts. See `core/attack_generator.py`.
    attack_generation_api_key: str = ""
    attack_generation_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    attack_generation_model: str = "gemini-2.5-pro"

    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite+aiosqlite:///./safesec_agents.db"

    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    cors_origins: str = "http://localhost:3000"

    # Sequential by default — most target bots hit in a demo/eval are
    # low-traffic ("vibe-coded") and have low rate limits, so firing up to
    # N attacks concurrently just means N requests racing the same
    # per-target token bucket. Bump this back up for targets known to
    # tolerate concurrent load.
    scan_concurrency: int = 1
    target_rate_limit_per_sec: float = 1.0
    target_rate_limit_retry_attempts: int = 3
    client_rate_limit_per_min: int = 10
    semantic_cache_threshold: float = 0.97
    # Each cached embedding+verdict is its own Redis key with this TTL, so the
    # cache self-cleans instead of growing forever — matters most on small
    # free-tier Redis plans (e.g. 30 MB) where an unbounded cache eventually
    # hits OOM. 30 days is a middle ground between reuse across repeat scans
    # and not hoarding stale entries indefinitely.
    semantic_cache_ttl_seconds: int = 60 * 60 * 24 * 30
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_cooldown_sec: int = 30

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
