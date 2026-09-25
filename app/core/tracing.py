"""LangFuse tracing: one trace per scan, one span per attack (target call)
+ one generation per judge call, with the judge's confidence attached as a
score on the generation.

No-ops gracefully (never raises) when LangFuse keys aren't configured, so
tracing is always optional and can never take down a scan.
"""

import logging
from contextlib import contextmanager

from app.config import settings

logger = logging.getLogger(__name__)

_langfuse_client = None
_langfuse_checked = False


def _get_client():
    global _langfuse_client, _langfuse_checked
    if _langfuse_checked:
        return _langfuse_client
    _langfuse_checked = True
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        return None
    try:
        from langfuse import Langfuse

        _langfuse_client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    except Exception as e:
        logger.warning("LangFuse init failed, tracing disabled: %s", e)
        _langfuse_client = None
    return _langfuse_client


class ScanTracer:
    """Best-effort wrapper around a LangFuse trace for a single scan. Every
    method swallows its own exceptions — tracing must never break a scan."""

    def __init__(self, scan_id: str, target_name: str):
        self._trace = None
        client = _get_client()
        if client is None:
            return
        try:
            self._trace = client.trace(
                name="safesec_agents_scan",
                id=scan_id,
                input={"target_name": target_name},
            )
        except Exception as e:
            logger.warning("LangFuse trace() failed: %s", e)

    @contextmanager
    def attack_span(self, attack_id: str, category: str, technique: str):
        span = None
        if self._trace is not None:
            try:
                span = self._trace.span(
                    name=f"attack:{attack_id}",
                    input={"category": category, "technique": technique},
                )
            except Exception as e:
                logger.warning("LangFuse span() failed: %s", e)
        try:
            yield span
        finally:
            if span is not None:
                try:
                    span.end()
                except Exception as e:
                    logger.warning("LangFuse span.end() failed: %s", e)

    def log_judge_generation(
        self,
        attack_id: str,
        bot_response: str,
        verdict: dict,
    ) -> None:
        if self._trace is None:
            return
        try:
            generation = self._trace.generation(
                name=f"judge:{attack_id}",
                input=bot_response,
                output=verdict,
            )
            generation.score(name="judge_confidence", value=verdict.get("confidence", 0.0))
        except Exception as e:
            logger.warning("LangFuse generation/score failed: %s", e)

    def finalize(self, summary: dict) -> None:
        if self._trace is None:
            return
        try:
            self._trace.update(output=summary)
        except Exception as e:
            logger.warning("LangFuse trace.update() failed: %s", e)
