"""System and health schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service health status")
    version: str = Field(..., description="Frank software version")
    timestamp: datetime = Field(..., description="UTC timestamp of the check")


class ReadyResponse(BaseModel):
    ready: bool
    checks: dict[str, bool] = Field(default_factory=dict)
    message: str = ""


class CapabilityItem(BaseModel):
    name: str
    available: bool
    details: dict[str, Any] = Field(default_factory=dict)


class SystemCapabilities(BaseModel):
    text_to_video: bool = False
    image_to_video: bool = False
    audio_generation: bool = False
    max_duration_seconds: float = 0.0
    max_resolution: tuple[int, int] = (0, 0)
    supported_formats: list[str] = Field(default_factory=list)
    backend: str = "unavailable"
    backend_status: str = "unavailable"
    hardware: dict[str, Any] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class ModelInfo(BaseModel):
    id: str
    name: str
    version: str | None = None
    status: str
    capabilities: list[str] = Field(default_factory=list)
    description: str = ""


class ModelListResponse(BaseModel):
    models: list[ModelInfo]
    active_model_id: str | None = None
