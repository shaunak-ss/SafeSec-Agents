"""Reserved seam for a future LLM-based attack-generation feature.

Today the attack library (`core/attack_library.py`) is static, hand-authored
data — nothing in the orchestrator calls into this module yet. It exists so
the model-config surface is separated ahead of time from `core/judge.py`:

- The judge (`judge.py`, Gemini `gemini-2.5-flash` primary / OpenRouter free
  Llama fallback) is deliberately cheap and fast — it's called once per
  attack, doing a low-stakes binary classification, so latency/cost per
  call matters far more than raw capability.
- Attack generation, if/when built, would want the opposite trade-off: a
  stronger, slower model (`settings.attack_generation_model`, default
  `gemini-2.5-pro`) capable of producing creative, novel jailbreak variants
  rather than reciting the same ~50 static prompts every scan.

Wiring this up would mean: generating new `Attack`-shaped turns (see
`attack_library.Attack`) for a given category/technique, likely seeded from
one of the existing hand-authored attacks, then feeding them into the
orchestrator alongside (or instead of) the static library. None of that
exists yet — calling `generate_attack()` today always raises
`NotImplementedError`.
"""

from app.config import settings


class AttackGenerationUnavailableError(Exception):
    """Raised once this is implemented, if the generation model call fails
    (mirrors `judge.JudgeUnavailableError`'s shape for consistency)."""


async def generate_attack(category: str, seed_technique: str | None = None) -> list[str]:
    """Would return a list of conversation turns for a novel attack in the
    given OWASP category, optionally inspired by an existing technique.

    Not implemented — `settings.attack_generation_model` /
    `settings.attack_generation_api_key` are configured but unused until
    this feature is actually built.
    """
    raise NotImplementedError(
        "Dynamic attack generation is not implemented yet; "
        f"(reserved model: {settings.attack_generation_model!r}). "
        "The static library in attack_library.py is the only attack "
        "source today."
    )
