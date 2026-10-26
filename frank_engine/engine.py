"""Frank Model Interface Engine — central coordinator."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from frank_engine.backends.mock import MockBackend
from frank_engine.backends.unavailable import UnavailableBackend
from frank_engine.contracts import (
    BackendStatus,
    GenerationRequest,
    GenerationResult,
    ModelBackend,
    ModelCapabilities,
    ProgressCallback,
)
from frank_engine.device_manager import detect_hardware
from frank_engine.errors import ModelNotAvailableError


class FrankEngine:
    """High-level FMIE coordinator.

    Manages the active backend, capability reporting, and request routing.
    Does not itself contain neural network weights.
    """

    def __init__(
        self,
        backend_name: str = "unavailable",
        output_dir: Path | None = None,
    ) -> None:
        self._output_dir = output_dir or Path("./data/temporary")
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._backend: ModelBackend = self._create_backend(backend_name)
        self._hardware = detect_hardware()

    def _create_backend(self, name: str) -> ModelBackend:
        name = (name or "unavailable").lower().strip()
        if name == "mock":
            return MockBackend(output_dir=self._output_dir)
        if name == "frank_native":
            return UnavailableBackend()
        return UnavailableBackend()

    @property
    def backend_name(self) -> str:
        return self._backend.name

    @property
    def backend_status(self) -> BackendStatus:
        return self._backend.status

    def get_capabilities(self) -> ModelCapabilities:
        return self._backend.inspect_capabilities()

    def get_hardware(self) -> dict[str, Any]:
        return dict(self._hardware)

    def get_system_summary(self) -> dict[str, Any]:
        caps = self.get_capabilities()
        return {
            "backend": self.backend_name,
            "backend_status": self.backend_status.value,
            "text_to_video": caps.text_to_video,
            "image_to_video": caps.image_to_video,
            "audio_generation": caps.audio_generation,
            "max_duration_seconds": caps.max_duration_seconds,
            "max_resolution": (caps.max_width, caps.max_height),
            "supported_formats": list(caps.supported_formats),
            "hardware": self._hardware,
            "notes": list(caps.notes) + list(self._hardware.get("notes", [])),
        }

    async def load(self) -> None:
        await self._backend.load_model()

    async def unload(self) -> None:
        await self._backend.unload_model()

    def validate(self, request: GenerationRequest) -> None:
        self._backend.validate_request(request)

    def estimate(self, request: GenerationRequest) -> dict[str, Any]:
        return self._backend.estimate_resources(request)

    async def generate(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult:
        if self.backend_status == BackendStatus.UNAVAILABLE:
            raise ModelNotAvailableError()
        if request.image_path is not None:
            return await self._backend.generate_from_image(request, progress, cancel_event)
        return await self._backend.generate_video(request, progress, cancel_event)
