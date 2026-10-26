"""FMIE-specific errors."""

from __future__ import annotations

from typing import Any


class EngineError(Exception):
    def __init__(self, message: str, code: str = "engine_error", details: dict[str, Any] | None = None) -> None:
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


class ModelNotAvailableError(EngineError):
    def __init__(self, message: str = "No Frank foundation model is currently available for generation.") -> None:
        super().__init__(message=message, code="model_not_available")


class ResourceError(EngineError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="resource_error", details=details)


class ValidationEngineError(EngineError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="validation_error", details=details)


class CancellationError(EngineError):
    def __init__(self, message: str = "Generation was cancelled.") -> None:
        super().__init__(message=message, code="cancelled")
