"""Pydantic request/response models — must match API Contract in BACKEND.md
and FRONTEND.md exactly. Do not change field names/shapes without updating
both docs.
"""

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["LLM01", "LLM02", "LLM06", "LLM07"]
Severity = Literal["critical", "high", "medium"]
RiskScore = Literal["low", "medium", "high", "critical"]
ScanStatus = Literal["queued", "running", "complete", "failed"]


class ScanCreateRequest(BaseModel):
    target_name: str
    target_endpoint: str
    target_method: str = "POST"
    target_headers: dict[str, str] = Field(default_factory=dict)
    target_body_template: dict = Field(default_factory=lambda: {"message": "{{prompt}}"})
    target_response_path: str = "reply"


class ScanCreateResponse(BaseModel):
    scan_id: str
    status: ScanStatus
    total_attacks: int


class AttackResultOut(BaseModel):
    attack_id: str
    category: Category
    technique: str
    broke_through: bool
    inconclusive: bool = False
    reason: str | None = None
    severity: Severity
    confidence: float | None
    evidence: str


class CategoryStat(BaseModel):
    tested: int
    broke_through: int
    inconclusive: int = 0


class ScanRecordOut(BaseModel):
    scan_id: str
    target_name: str
    status: ScanStatus
    started_at: str | None
    completed_at: str | None
    total_attacks: int
    broke_through_count: int
    inconclusive_count: int = 0
    risk_score: RiskScore | None
    category_breakdown: dict[str, CategoryStat]
    results: list[AttackResultOut]


# ---- SSE event payloads (documented for internal typing; the wire format
# is the raw dict yielded by the orchestrator, see core/orchestrator.py) ----


class ScanStartedEvent(BaseModel):
    type: Literal["scan_started"] = "scan_started"
    scan_id: str
    total_attacks: int


class Progress(BaseModel):
    completed: int
    total: int


class AttackResultEvent(BaseModel):
    type: Literal["attack_result"] = "attack_result"
    attack_id: str
    category: Category
    technique: str
    broke_through: bool
    inconclusive: bool = False
    reason: str | None = None
    severity: Severity
    confidence: float | None
    evidence: str
    progress: Progress


class AttackErrorEvent(BaseModel):
    type: Literal["attack_error"] = "attack_error"
    attack_id: str
    reason: str
    progress: Progress


class ScanCompleteEvent(BaseModel):
    type: Literal["scan_complete"] = "scan_complete"
    scan_id: str
    broke_through_count: int
    inconclusive_count: int = 0
    error_count: int
    risk_score: RiskScore
    duration_ms: int


class ScanSummaryOut(BaseModel):
    scan_id: str
    target_name: str
    status: ScanStatus
    started_at: str | None
    completed_at: str | None
    total_attacks: int
    broke_through_count: int
    inconclusive_count: int = 0
    error_count: int
    risk_score: RiskScore | None
    duration_ms: int | None


class ScanListResponse(BaseModel):
    scans: list[ScanSummaryOut]
    total: int
