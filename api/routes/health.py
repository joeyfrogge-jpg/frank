"""Health and readiness endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from api.schemas.system import HealthResponse, ReadyResponse
from frank_engine import __version__ as engine_version

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=engine_version,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/ready", response_model=ReadyResponse)
async def ready() -> ReadyResponse:
    checks = {"api": True, "engine": True}
    return ReadyResponse(ready=True, checks=checks, message="Frank API is ready")
