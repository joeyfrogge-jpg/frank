"""FastAPI dependency injection for Frank."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from frank_engine.engine import FrankEngine


@lru_cache
def get_engine() -> FrankEngine:
    import os

    backend = os.environ.get("FRANK_ENGINE_BACKEND", "unavailable")
    data_root = Path(os.environ.get("FRANK_DATA_ROOT", "./data"))
    return FrankEngine(backend_name=backend, output_dir=data_root / "temporary")
