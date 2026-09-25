"""SQLAlchemy async models: scans, attack_results."""

from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.config import settings


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Scan(Base):
    __tablename__ = "scans"

    scan_id: Mapped[str] = mapped_column(String, primary_key=True)
    target_name: Mapped[str] = mapped_column(String)
    target_endpoint: Mapped[str] = mapped_column(String)
    target_method: Mapped[str] = mapped_column(String, default="POST")
    target_headers: Mapped[dict] = mapped_column(JSON, default=dict)
    target_body_template: Mapped[dict] = mapped_column(JSON, default=dict)
    target_response_path: Mapped[str] = mapped_column(String, default="reply")

    status: Mapped[str] = mapped_column(String, default="queued")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    total_attacks: Mapped[int] = mapped_column(Integer, default=0)
    broke_through_count: Mapped[int] = mapped_column(Integer, default=0)
    inconclusive_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    risk_score: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)

    # Indexed: GET /scans (dashboard) orders by this + LIMIT/OFFSET on every
    # request — without an index that's a full table scan + temp b-tree sort
    # instead of an index range scan (see git history for a before/after
    # EXPLAIN QUERY PLAN benchmark).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    results: Mapped[list["AttackResult"]] = relationship(
        back_populates="scan", cascade="all, delete-orphan", order_by="AttackResult.id"
    )


class AttackResult(Base):
    __tablename__ = "attack_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Indexed: every GET /scans/{id} and GET /scans/{id}/report filters on
    # this (the single most-run query in the app). SQLite/Postgres don't
    # auto-index FK columns, so without this it's a full table scan that
    # gets slower as the attack_results table grows across all scans.
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.scan_id"), index=True)

    attack_id: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    technique: Mapped[str] = mapped_column(String)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False)
    inconclusive: Mapped[bool] = mapped_column(Boolean, default=False)

    broke_through: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    severity: Mapped[str | None] = mapped_column(String, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scan: Mapped[Scan] = relationship(back_populates="results")


engine = create_async_engine(settings.database_url, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


# There's no Alembic in this project — `create_all()` below only creates
# tables that don't exist yet, so it won't retrofit an index onto a table
# that was already created before the index was added to the model. These
# statements are the migration for that: `IF NOT EXISTS` makes them a no-op
# on a fresh DB (where create_all already added the index) and a real
# `CREATE INDEX` on an existing DB that predates it. Valid on both SQLite
# and Postgres.
_INDEX_MIGRATIONS = (
    "CREATE INDEX IF NOT EXISTS ix_attack_results_scan_id ON attack_results (scan_id)",
    "CREATE INDEX IF NOT EXISTS ix_scans_created_at ON scans (created_at)",
)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _INDEX_MIGRATIONS:
            await conn.exec_driver_sql(stmt)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
