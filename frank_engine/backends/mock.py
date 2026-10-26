"""Mock backend for automated testing only.

Produces deterministic, clearly-labeled test artifacts.
Never present MockBackend output as real Frank-generated video.
"""

from __future__ import annotations

import asyncio
import hashlib
import struct
import wave
from pathlib import Path
from typing import Any

from frank_engine.contracts import (
    BackendStatus,
    GenerationRequest,
    GenerationResult,
    ModelCapabilities,
    ProgressCallback,
)
from frank_engine.errors import CancellationError, ValidationEngineError


class MockBackend:
    """Deterministic test backend. Outputs are labeled as test fixtures."""

    name = "mock"

    def __init__(self, output_dir: Path | None = None) -> None:
        self._status = BackendStatus.MOCK
        self._output_dir = output_dir or Path("./data/temporary")
        self._output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def status(self) -> BackendStatus:
        return self._status

    def inspect_capabilities(self) -> ModelCapabilities:
        return ModelCapabilities(
            text_to_video=True,
            image_to_video=True,
            audio_generation=False,
            max_width=512,
            max_height=512,
            max_frames=32,
            max_fps=16,
            max_duration_seconds=4.0,
            supported_formats=("mp4", "webm"),
            notes=(
                "MOCK BACKEND — for automated tests only.",
                "Outputs are synthetic test fixtures, not AI-generated video.",
            ),
        )

    async def load_model(self) -> None:
        self._status = BackendStatus.MOCK

    async def unload_model(self) -> None:
        self._status = BackendStatus.MOCK

    def validate_request(self, request: GenerationRequest) -> None:
        caps = self.inspect_capabilities()
        if request.width > caps.max_width or request.height > caps.max_height:
            raise ValidationEngineError(
                f"Resolution {request.width}x{request.height} exceeds mock limit "
                f"{caps.max_width}x{caps.max_height}"
            )
        if request.num_frames > caps.max_frames:
            raise ValidationEngineError(
                f"num_frames {request.num_frames} exceeds mock limit {caps.max_frames}"
            )
        if request.format not in caps.supported_formats:
            raise ValidationEngineError(f"Unsupported format: {request.format}")

    def estimate_resources(self, request: GenerationRequest) -> dict[str, Any]:
        return {"status": "mock", "estimated_memory_mb": 64, "estimated_seconds": 0.5}

    async def generate_video(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult:
        return await self._run_mock(request, progress, cancel_event)

    async def generate_from_image(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None = None,
        cancel_event: Any = None,
    ) -> GenerationResult:
        return await self._run_mock(request, progress, cancel_event)

    async def _run_mock(
        self,
        request: GenerationRequest,
        progress: ProgressCallback | None,
        cancel_event: Any,
    ) -> GenerationResult:
        self.validate_request(request)
        stages = [
            (10.0, "validate", "Validating mock request"),
            (40.0, "synthesize", "Synthesizing test frames"),
            (70.0, "encode", "Writing test artifact"),
            (100.0, "complete", "Mock generation complete"),
        ]
        for percent, stage, message in stages:
            if cancel_event is not None and getattr(cancel_event, "is_set", lambda: False)():
                raise CancellationError()
            if progress is not None:
                result = progress(percent, stage, message)
                if asyncio.iscoroutine(result):
                    await result
            await asyncio.sleep(0.01)
        out_name = f"mock_{request.job_id or 'test'}.wav"
        out_path = self._output_dir / out_name
        sample_rate = 8000
        duration = max(0.25, request.num_frames / max(request.fps, 1))
        n_samples = int(sample_rate * duration)
        with wave.open(str(out_path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            for i in range(n_samples):
                value = int(1000 * (i % 50) / 50)
                wf.writeframes(struct.pack("<h", value))
        checksum = hashlib.sha256(out_path.read_bytes()).hexdigest()
        return GenerationResult(
            success=True,
            output_path=out_path,
            width=request.width,
            height=request.height,
            num_frames=request.num_frames,
            fps=float(request.fps),
            duration_seconds=duration,
            format="wav",
            has_audio=True,
            checksum_sha256=checksum,
            source="mock",
            metadata={
                "note": "MOCK ARTIFACT — not a real Frank-generated video",
                "prompt_hash": hashlib.sha256(request.prompt.encode()).hexdigest()[:16],
            },
        )
