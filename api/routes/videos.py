"""Video generation endpoints (Milestone 1: accept + reject correctly)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import get_engine
from api.errors import CapabilityError, UnavailableError
from api.schemas.videos import VideoGenerationRequest
from frank_engine.engine import FrankEngine
from frank_engine.errors import ModelNotAvailableError

router = APIRouter(prefix="/v1", tags=["videos"])


@router.post("/videos", status_code=202)
async def create_video(
    body: VideoGenerationRequest,
    engine: FrankEngine = Depends(get_engine),
) -> dict:
    caps = engine.get_capabilities()
    if not caps.text_to_video:
        raise UnavailableError(
            "Text-to-video is not available. No Frank foundation model is loaded.",
            details={
                "backend": engine.backend_name,
                "backend_status": engine.backend_status.value,
            },
        )

    try:
        from frank_engine.contracts import GenerationRequest

        req = GenerationRequest(
            prompt=body.prompt,
            negative_prompt=body.negative_prompt,
            width=body.width,
            height=body.height,
            num_frames=body.num_frames,
            fps=body.fps,
            seed=body.seed,
            guidance_scale=body.guidance_scale,
            format=body.format,
        )
        engine.validate(req)
    except ModelNotAvailableError as exc:
        raise UnavailableError(str(exc)) from exc
    except Exception as exc:
        raise CapabilityError(str(exc)) from exc

    raise UnavailableError(
        "Generation pipeline is not yet fully implemented. "
        "Job persistence and worker orchestration arrive in Milestone 3.",
        details={"stage": "milestone_1_stub"},
    )
