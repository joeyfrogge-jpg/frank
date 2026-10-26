"""System capabilities and model listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import get_engine
from api.schemas.system import ModelInfo, ModelListResponse, SystemCapabilities
from frank_engine.engine import FrankEngine

router = APIRouter(prefix="/v1", tags=["system"])


@router.get("/system/capabilities", response_model=SystemCapabilities)
async def capabilities(engine: FrankEngine = Depends(get_engine)) -> SystemCapabilities:
    summary = engine.get_system_summary()
    return SystemCapabilities(
        text_to_video=summary["text_to_video"],
        image_to_video=summary["image_to_video"],
        audio_generation=summary["audio_generation"],
        max_duration_seconds=summary["max_duration_seconds"],
        max_resolution=summary["max_resolution"],
        supported_formats=summary["supported_formats"],
        backend=summary["backend"],
        backend_status=summary["backend_status"],
        hardware=summary["hardware"],
        notes=summary["notes"],
    )


@router.get("/models", response_model=ModelListResponse)
async def list_models(engine: FrankEngine = Depends(get_engine)) -> ModelListResponse:
    models: list[ModelInfo] = []
    status = engine.backend_status.value
    if engine.backend_name == "mock":
        models.append(
            ModelInfo(
                id="mock-test",
                name="Mock Test Backend",
                version="0.1.0",
                status="available",
                capabilities=["text_to_video", "image_to_video"],
                description="Deterministic test fixture only. Not a real generative model.",
            )
        )
    else:
        models.append(
            ModelInfo(
                id="frank-foundation",
                name="Frank Foundation Model",
                version=None,
                status="unavailable",
                capabilities=[],
                description="Independently developed Frank video model — research stage, not yet trained.",
            )
        )
    return ModelListResponse(models=models, active_model_id=None if status == "unavailable" else models[0].id)
