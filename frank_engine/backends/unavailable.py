"""Explicit unavailable backend.

Used when no Frank foundation model is loaded. This is the default
production state until a real Frank model exists and is registered.
"""

from __future__ import annotations

from typing import Any

from frank_engine.contracts import (
    BackendStatus,
    GenerationRequest,
    GenerationResult,
    ModelCapabilities,
    ProgressCallback,
)
from frank_engine.errors import ModelNotAvailableError


class UnavailableBackend:
    """Backend that always reports generation is unavailable."""

    name = "unavailable"

    def __init__(self) -> None:
        self._status = BackendStatus.UNAVAILABLE

    @property
    def status(self) -> BackendStatus:
        return self._status

    def inspect_capabilities(self) -> ModelCapabilities:
        return ModelCapabilities(
            text_to_video=False,
            image_to_video=False,
            audio_generation=False,
            max_width=0,
            max_height=0,
            max_frames=0,
            max_fps=0,
            max_duration_seconds=0.0,
            supported_formats=(),
            notes=(
                "No Frank foundation model is currently available.",
                "Generation requests will be rejected.",
            ),
        )

    async def load_model(self) -> None:
        self._status = BackendStatus.UNAVAILABLE

    async def unload_model(self) -> None:
        self._status = BackendStatus.UNAVAILABLE

    def validate_request(self, request: GenerationRequest) -> None:
        raise ModelNotAvailableError()

    def estimate_resources(self, request: GenerationRequest) -> dict[str, Any]:
        return {"status": "unavailable", "estimated_memory_mb": 0}

    async def generate_video(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult:
        raise ModelNotAvailableError()

    async def generate_from_image(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult:
        raise ModelNotAvailableError()
