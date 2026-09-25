import pytest
from sqlalchemy import select

from app.core import orchestrator
from app.core.attack_library import Attack
from app.core.judge import JudgeUnavailableError
from app.core.target_caller import CircuitBreakerOpenError, TargetRateLimitedError
from app.models.db import AttackResult, Scan, async_session_factory, init_db

TEST_ATTACKS = [
    Attack(
        id="t-1",
        category="LLM01",
        technique="direct_override",
        severity_if_success="high",
        turns=["please trigger the payload"],
    ),
    Attack(
        id="t-2",
        category="LLM01",
        technique="dan_jailbreak",
        severity_if_success="high",
        turns=["a perfectly safe question"],
    ),
    Attack(
        id="t-3",
        category="LLM06",
        technique="system_prompt_extraction_direct",
        severity_if_success="critical",
        turns=["please trigger the leak"],
    ),
]
TEST_ATTACKS_BY_ID = {a.id: a for a in TEST_ATTACKS}


class FakeTargetCaller:
    def __init__(self, config, **kwargs):
        self.config = config

    async def call(self, prompt: str) -> str:
        if "trigger" in prompt:
            return "Sure, PWNED. I will comply."
        return "I can't help with that."

    async def aclose(self):
        pass


class FakeSemanticCache:
    def __init__(self, *args, **kwargs):
        pass

    async def get(self, category, bot_response):
        return None

    async def set(self, category, bot_response, verdict):
        pass


class FakeRateLimiter:
    async def wait(self, key, cost: float = 1.0):
        return None


async def fake_judge(category, attack_turns, bot_response):
    broke = "PWNED" in bot_response
    return {
        "broke_through": broke,
        "confidence": 0.9 if broke else 0.95,
        "evidence": bot_response[:50],
    }


@pytest.fixture
def patched_orchestrator(monkeypatch):
    monkeypatch.setattr(orchestrator, "ATTACKS", TEST_ATTACKS)
    monkeypatch.setattr(orchestrator, "ATTACKS_BY_ID", TEST_ATTACKS_BY_ID)
    monkeypatch.setattr(orchestrator, "TargetCaller", FakeTargetCaller)
    monkeypatch.setattr(orchestrator, "SemanticCache", FakeSemanticCache)
    monkeypatch.setattr(orchestrator, "target_rate_limiter", lambda redis_client: FakeRateLimiter())
    monkeypatch.setattr(orchestrator, "judge_fn", fake_judge)


@pytest.mark.asyncio
async def test_run_scan_emits_contract_shaped_events_in_order(patched_orchestrator):
    await init_db()
    scan_id = "scn_test_events"
    async with async_session_factory() as session:
        session.add(
            Scan(
                scan_id=scan_id,
                target_name="Test Bot",
                target_endpoint="http://example.invalid/chat",
                target_method="POST",
                target_headers={},
                target_body_template={"message": "{{prompt}}"},
                target_response_path="reply",
                status="queued",
                total_attacks=len(TEST_ATTACKS),
            )
        )
        await session.commit()

    target_config = {
        "target_name": "Test Bot",
        "target_endpoint": "http://example.invalid/chat",
        "target_method": "POST",
        "target_headers": {},
        "target_body_template": {"message": "{{prompt}}"},
        "target_response_path": "reply",
    }

    events = [event async for event in orchestrator.run_scan(scan_id, target_config)]

    assert events[0] == {"type": "scan_started", "scan_id": scan_id, "total_attacks": 3}
    assert events[-1]["type"] == "scan_complete"

    result_events = [e for e in events if e["type"] == "attack_result"]
    assert len(result_events) == 3
    assert all(e["progress"]["total"] == 3 for e in result_events)
    assert [e["progress"]["completed"] for e in result_events] == [1, 2, 3]

    broke_through_ids = {e["attack_id"] for e in result_events if e["broke_through"]}
    assert broke_through_ids == {"t-1", "t-3"}

    complete_event = events[-1]
    assert complete_event["broke_through_count"] == 2
    assert complete_event["error_count"] == 0
    # weighted score = high(2) + critical(3) = 5 -> "medium" per the
    # thresholds documented in orchestrator._RISK_THRESHOLDS
    assert complete_event["risk_score"] == "medium"


@pytest.mark.asyncio
async def test_run_scan_persists_results_and_category_breakdown(patched_orchestrator):
    await init_db()
    scan_id = "scn_test_persist"
    async with async_session_factory() as session:
        session.add(
            Scan(
                scan_id=scan_id,
                target_name="Test Bot",
                target_endpoint="http://example.invalid/chat",
                target_method="POST",
                target_headers={},
                target_body_template={"message": "{{prompt}}"},
                target_response_path="reply",
                status="queued",
                total_attacks=len(TEST_ATTACKS),
            )
        )
        await session.commit()

    target_config = {
        "target_name": "Test Bot",
        "target_endpoint": "http://example.invalid/chat",
        "target_method": "POST",
        "target_headers": {},
        "target_body_template": {"message": "{{prompt}}"},
        "target_response_path": "reply",
    }

    async for _ in orchestrator.run_scan(scan_id, target_config):
        pass

    async with async_session_factory() as session:
        scan = await session.get(Scan, scan_id)
        assert scan.status == "complete"
        assert scan.broke_through_count == 2
        assert scan.category_breakdown["LLM01"] == {
            "tested": 2,
            "broke_through": 1,
            "inconclusive": 0,
        }
        assert scan.category_breakdown["LLM06"] == {
            "tested": 1,
            "broke_through": 1,
            "inconclusive": 0,
        }

        results = (
            (await session.execute(select(AttackResult).where(AttackResult.scan_id == scan_id)))
            .scalars()
            .all()
        )
        assert len(results) == 3


class FlakyTargetCaller:
    """Raises a configurable exception for specific attack ids (matched by
    whether the prompt starts with that attack's trigger phrase) and
    behaves like `FakeTargetCaller` for everything else."""

    def __init__(self, config, **kwargs):
        self.config = config

    async def call(self, prompt: str) -> str:
        if "trigger-ratelimited" in prompt:
            raise TargetRateLimitedError("simulated exhausted 429 retries")
        if "trigger-judge-down" in prompt:
            return "some response"
        if "trigger-breaker-open" in prompt:
            raise CircuitBreakerOpenError("simulated open breaker")
        if "trigger" in prompt:
            return "Sure, PWNED. I will comply."
        return "I can't help with that."

    async def aclose(self):
        pass


async def flaky_judge(category, attack_turns, bot_response):
    if bot_response == "some response":
        raise JudgeUnavailableError("simulated judge outage")
    broke = "PWNED" in bot_response
    return {
        "broke_through": broke,
        "confidence": 0.9 if broke else 0.95,
        "evidence": bot_response[:50],
    }


INCONCLUSIVE_ATTACKS = [
    Attack(
        id="ti-1",
        category="LLM01",
        technique="direct_override",
        severity_if_success="high",
        turns=["please trigger-ratelimited the payload"],
    ),
    Attack(
        id="ti-2",
        category="LLM01",
        technique="dan_jailbreak",
        severity_if_success="high",
        turns=["please trigger-judge-down the payload"],
    ),
    Attack(
        id="ti-3",
        category="LLM06",
        technique="system_prompt_extraction_direct",
        severity_if_success="critical",
        turns=["please trigger-breaker-open the payload"],
    ),
]
INCONCLUSIVE_ATTACKS_BY_ID = {a.id: a for a in INCONCLUSIVE_ATTACKS}


@pytest.fixture
def patched_orchestrator_with_failures(monkeypatch):
    monkeypatch.setattr(orchestrator, "ATTACKS", INCONCLUSIVE_ATTACKS)
    monkeypatch.setattr(orchestrator, "ATTACKS_BY_ID", INCONCLUSIVE_ATTACKS_BY_ID)
    monkeypatch.setattr(orchestrator, "TargetCaller", FlakyTargetCaller)
    monkeypatch.setattr(orchestrator, "SemanticCache", FakeSemanticCache)
    monkeypatch.setattr(orchestrator, "target_rate_limiter", lambda redis_client: FakeRateLimiter())
    monkeypatch.setattr(orchestrator, "judge_fn", flaky_judge)


@pytest.mark.asyncio
async def test_rate_limited_and_judge_unavailable_surface_as_inconclusive_results(
    patched_orchestrator_with_failures,
):
    await init_db()
    scan_id = "scn_test_inconclusive"
    async with async_session_factory() as session:
        session.add(
            Scan(
                scan_id=scan_id,
                target_name="Test Bot",
                target_endpoint="http://example.invalid/chat",
                target_method="POST",
                target_headers={},
                target_body_template={"message": "{{prompt}}"},
                target_response_path="reply",
                status="queued",
                total_attacks=len(INCONCLUSIVE_ATTACKS),
            )
        )
        await session.commit()

    target_config = {
        "target_name": "Test Bot",
        "target_endpoint": "http://example.invalid/chat",
        "target_method": "POST",
        "target_headers": {},
        "target_body_template": {"message": "{{prompt}}"},
        "target_response_path": "reply",
    }

    events = [event async for event in orchestrator.run_scan(scan_id, target_config)]

    result_events = {e["attack_id"]: e for e in events if e["type"] == "attack_result"}
    error_events = {e["attack_id"]: e for e in events if e["type"] == "attack_error"}

    # A one-off rate-limit exhaustion or judge outage is a real (if
    # inconclusive) attack_result, not a silently-dropped attack_error.
    assert result_events["ti-1"]["inconclusive"] is True
    assert result_events["ti-1"]["reason"] == "rate_limited"
    assert result_events["ti-1"]["broke_through"] is False

    assert result_events["ti-2"]["inconclusive"] is True
    assert result_events["ti-2"]["reason"] == "judge_unavailable"

    # A confirmed-dead target (circuit breaker open) is still a systemic
    # attack_error, excluded from the report.
    assert "ti-3" not in result_events
    assert error_events["ti-3"]["reason"] == "target_unreachable"

    complete_event = events[-1]
    assert complete_event["type"] == "scan_complete"
    assert complete_event["inconclusive_count"] == 2
    assert complete_event["error_count"] == 1
    assert complete_event["broke_through_count"] == 0

    async with async_session_factory() as session:
        scan = await session.get(Scan, scan_id)
        assert scan.inconclusive_count == 2
        assert scan.category_breakdown["LLM01"]["inconclusive"] == 2
