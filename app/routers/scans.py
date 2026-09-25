import asyncio
import json
import logging
import secrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import func, select

from app.core.attack_library import ATTACKS
from app.core.event_bus import scan_event_bus
from app.core.orchestrator import run_scan
from app.core.rate_limiter import RateLimitExceededError, client_rate_limiter
from app.core.redis_client import get_redis_client
from app.core.report import render_report_html
from app.models.db import AttackResult, Scan, async_session_factory
from app.models.schemas import (
    AttackResultOut,
    CategoryStat,
    ScanCreateRequest,
    ScanCreateResponse,
    ScanListResponse,
    ScanRecordOut,
    ScanSummaryOut,
)

logger = logging.getLogger(__name__)
router = APIRouter()

TOTAL_ATTACKS = len(ATTACKS)


def _new_scan_id() -> str:
    return f"scn_{secrets.token_hex(3)}"


async def _run_and_publish(scan_id: str, target_config: dict) -> None:
    try:
        async for event in run_scan(scan_id, target_config):
            await scan_event_bus.publish(scan_id, event)
    except Exception:
        logger.exception("Scan %s crashed unexpectedly", scan_id)
        async with async_session_factory() as session:
            scan = await session.get(Scan, scan_id)
            if scan is not None and scan.status != "complete":
                scan.status = "failed"
                await session.commit()
    finally:
        await scan_event_bus.mark_done(scan_id)


@router.post("/scans", response_model=ScanCreateResponse, status_code=201)
async def create_scan(payload: ScanCreateRequest, request: Request) -> ScanCreateResponse:
    limiter = client_rate_limiter(get_redis_client())
    client_key = request.client.host if request.client else "unknown"
    try:
        await limiter.acquire(client_key)
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e)) from e

    scan_id = _new_scan_id()
    target_config = payload.model_dump()

    async with async_session_factory() as session:
        session.add(
            Scan(
                scan_id=scan_id,
                target_name=payload.target_name,
                target_endpoint=payload.target_endpoint,
                target_method=payload.target_method,
                target_headers=payload.target_headers,
                target_body_template=payload.target_body_template,
                target_response_path=payload.target_response_path,
                status="queued",
                total_attacks=TOTAL_ATTACKS,
            )
        )
        await session.commit()

    scan_event_bus.create(scan_id)
    asyncio.create_task(_run_and_publish(scan_id, target_config))

    return ScanCreateResponse(scan_id=scan_id, status="queued", total_attacks=TOTAL_ATTACKS)


@router.get("/scans", response_model=ScanListResponse)
async def list_scans(limit: int = 20, offset: int = 0) -> ScanListResponse:
    """Summary list for the monitoring dashboard — most recent first."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    async with async_session_factory() as session:
        total = (await session.execute(select(func.count()).select_from(Scan))).scalar_one()
        rows = (
            await session.execute(
                select(Scan).order_by(Scan.created_at.desc()).limit(limit).offset(offset)
            )
        ).scalars().all()

    return ScanListResponse(
        total=total,
        scans=[
            ScanSummaryOut(
                scan_id=scan.scan_id,
                target_name=scan.target_name,
                status=scan.status,
                started_at=scan.started_at.isoformat() if scan.started_at else None,
                completed_at=scan.completed_at.isoformat() if scan.completed_at else None,
                total_attacks=scan.total_attacks,
                broke_through_count=scan.broke_through_count,
                inconclusive_count=scan.inconclusive_count,
                error_count=scan.error_count,
                risk_score=scan.risk_score,
                duration_ms=scan.duration_ms,
            )
            for scan in rows
        ],
    )


@router.get("/scans/{scan_id}/stream")
async def stream_scan(scan_id: str) -> StreamingResponse:
    async with async_session_factory() as session:
        scan = await session.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail=f"unknown scan '{scan_id}'")

    async def event_source():
        async for event in scan_event_bus.subscribe(scan_id):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/scans/{scan_id}", response_model=ScanRecordOut)
async def get_scan(scan_id: str) -> ScanRecordOut:
    async with async_session_factory() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail=f"unknown scan '{scan_id}'")

        result_rows = (
            await session.execute(
                select(AttackResult)
                .where(AttackResult.scan_id == scan_id, AttackResult.is_error.is_(False))
                .order_by(AttackResult.id)
            )
        ).scalars().all()

    return ScanRecordOut(
        scan_id=scan.scan_id,
        target_name=scan.target_name,
        status=scan.status,
        started_at=scan.started_at.isoformat() if scan.started_at else None,
        completed_at=scan.completed_at.isoformat() if scan.completed_at else None,
        total_attacks=scan.total_attacks,
        broke_through_count=scan.broke_through_count,
        inconclusive_count=scan.inconclusive_count,
        risk_score=scan.risk_score,
        category_breakdown={
            cat: CategoryStat(**stats) for cat, stats in (scan.category_breakdown or {}).items()
        },
        results=[
            AttackResultOut(
                attack_id=r.attack_id,
                category=r.category,
                technique=r.technique,
                broke_through=r.broke_through,
                inconclusive=r.inconclusive,
                reason=r.error_reason if r.inconclusive else None,
                severity=r.severity,
                confidence=r.confidence,
                evidence=r.evidence or "",
            )
            for r in result_rows
        ],
    )


@router.get("/scans/{scan_id}/report", response_class=HTMLResponse)
async def get_scan_report(scan_id: str) -> HTMLResponse:
    async with async_session_factory() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail=f"unknown scan '{scan_id}'")

        result_rows = (
            await session.execute(
                select(AttackResult).where(AttackResult.scan_id == scan_id).order_by(AttackResult.id)
            )
        ).scalars().all()

    return HTMLResponse(content=render_report_html(scan, result_rows))
