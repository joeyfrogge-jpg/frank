"""Video generation request and response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    negative_prompt: str | None = Field(default=None, max_length=2000)
    width: int = Field(default=512, ge=64, le=1024)
    height: int = Field(default=512, ge=64, le=1024)
    num_frames: int = Field(default=16, ge=1, le=64)
    fps: int = Field(default=8, ge=1, le=30)
    seed: int | None = Field(default=None, ge=0)
    guidance_scale: float = Field(default=7.5, ge=0.0, le=30.0)
    format: str = Field(default="mp4")

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        allowed = {"mp4", "webm"}
        if v.lower() not in allowed:
            raise ValueError(f"format must be one of {allowed}")
        return v.lower()

    @field_validator("width", "height")
    @classmethod
    def validate_dimension(cls, v: int) -> int:
        if v % 8 != 0:
            raise ValueError("width and height must be multiples of 8")
        return v


class ImageToVideoRequest(VideoGenerationRequest):
    strength: float = Field(default=0.8, ge=0.0, le=1.0)


class VideoMetadata(BaseModel):
    video_id: str
    job_id: str | None = None
    prompt: str | None = None
    width: int
    height: int
    num_frames: int
    fps: float
    duration_seconds: float
    format: str
    codec: str | None = None
    file_size_bytes: int | None = None
    checksum_sha256: str | None = None
    created_at: datetime
    has_audio: bool = False
    source: str = "frank"
    extra: dict[str, Any] = Field(default_factory=dict)


class VideoResponse(BaseModel):
    video_id: str
    status: str
    metadata: VideoMetadata | None = None
    content_url: str | None = None
