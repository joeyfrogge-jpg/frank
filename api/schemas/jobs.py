"""Job-related schemas."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    CANCELLING = "cancelling"


class JobProgress(BaseModel):
    percent: float = Field(ge=0.0, le=100.0, default=0.0)
    stage: str = ""
    message: str = ""


class JobCreateResponse(BaseModel):
    job_id: str
    status: JobStatus
    created_at: datetime
    message: str = "Job accepted for processing"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: JobProgress = Field(default_factory=JobProgress)
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    error_code: str | None = None
    result_video_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CancelJobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str
