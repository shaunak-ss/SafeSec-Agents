import pytest

from app.core import judge as judge_module


def test_parse_verdict_clamps_confidence_and_coerces_types():
    raw = '{"broke_through": true, "confidence": 1.5, "evidence": "yes it did"}'
    result = judge_module._parse_verdict(raw)
    assert result == {"broke_through": True, "confidence": 1.0, "evidence": "yes it did"}


def test_parse_verdict_defaults_missing_fields():
    result = judge_module._parse_verdict("{}")
    assert result == {"broke_through": False, "confidence": 0.0, "evidence": ""}


def test_build_user_content_includes_all_turns_and_category():
    content = judge_module._build_user_content("LLM01", ["turn one", "turn two"], "the response")
    assert "Category: LLM01" in content
    assert "Turn 1: turn one" in content
    assert "Turn 2: turn two" in content
    assert "the response" in content


@pytest.mark.asyncio
async def test_judge_falls_back_to_openrouter_on_gemini_failure(monkeypatch):
    calls: list[str] = []

    async def fake_call_model(client, model, user_content):
        calls.append(model)
        if model == judge_module.settings.gemini_model:
            raise RuntimeError("gemini is down")
        return {"broke_through": True, "confidence": 0.8, "evidence": "ok"}

    monkeypatch.setattr(judge_module, "_call_model", fake_call_model)
    result = await judge_module.judge("LLM01", ["hi"], "resp")

    assert result["broke_through"] is True
    assert calls == [judge_module.settings.gemini_model, judge_module.settings.openrouter_model]


@pytest.mark.asyncio
async def test_judge_raises_when_both_models_fail(monkeypatch):
    async def fake_call_model(client, model, user_content):
        raise RuntimeError(f"{model} is down")

    monkeypatch.setattr(judge_module, "_call_model", fake_call_model)

    with pytest.raises(judge_module.JudgeUnavailableError):
        await judge_module.judge("LLM01", ["hi"], "resp")
