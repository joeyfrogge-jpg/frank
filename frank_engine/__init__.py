"""Frank Model Interface Engine (FMIE)."""

from frank_engine.contracts import (
    BackendStatus,
    GenerationRequest,
    GenerationResult,
    ModelCapabilities,
    ProgressCallback,
)
from frank_engine.engine import FrankEngine
from frank_engine.errors import EngineError, ModelNotAvailableError

__all__ = [
    "FrankEngine",
    "BackendStatus",
    "GenerationRequest",
    "GenerationResult",
    "ModelCapabilities",
    "ProgressCallback",
    "EngineError",
    "ModelNotAvailableError",
]

__version__ = "0.1.0"
