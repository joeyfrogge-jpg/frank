"""Frank Model Interface Engine — stable internal contracts.

These types define the boundary between the API/orchestration layer
and any future Frank foundation model backend. They are intentionally
independent of any third-party generation system.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Protocol


class BackendStatus(str, Enum):
    UNAVAILABLE = "unavailable"
    LOADING = "loading"
    READY = "ready"
    ERROR = "error"
    MOCK = "mock"


@dataclass(frozen=True)
class ModelCapabilities:
    text_to_video: bool = False
    image_to_video: bool = False
    audio_generation: bool = False
    max_width: int = 0
    max_height: int = 0
    max_frames: int = 0
    max_fps: int = 0
    max_duration_seconds: float = 0.0
    supported_formats: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()


@dataclass
class GenerationRequest:
    prompt: str
    negative_prompt: str | None = None
    width: int = 512
    height: int = 512
    num_frames: int = 16
    fps: int = 8
    seed: int | None = None
    guidance_scale: float = 7.5
    format: str = "mp4"
    image_path: Path | None = None
    strength: float = 0.8
    job_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationResult:
    success: bool
    output_path: Path | None = None
    width: int = 0
    height: int = 0
    num_frames: int = 0
    fps: float = 0.0
    duration_seconds: float = 0.0
    format: str = ""
    has_audio: bool = False
    checksum_sha256: str | None = None
    source: str = "frank"
    error: str | None = None
    error_code: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


ProgressCallback = Callable[[float, str, str], Awaitable[None] | None]


class ModelBackend(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def status(self) -> BackendStatus: ...

    def inspect_capabilities(self) -> ModelCapabilities: ...

    async def load_model(self) -> None: ...

    async def unload_model(self) -> None: ...

    def validate_request(self, request: GenerationRequest) -> None: ...

    def estimate_resources(self, request: GenerationRequest) -> dict[str, Any]: ...

    async def generate_video(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult: ...

    async def generate_from_image(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult: ...
