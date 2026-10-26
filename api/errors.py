"""Frank API error definitions and handlers."""

from __future__ import annotations

from typing import Any

from fastapi import Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class FrankError(Exception):
    def __init__(
        self,
        message: str,
        code: str = "frank_error",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class ValidationError(FrankError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="validation_error", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, details=details)


class NotFoundError(FrankError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="not_found", status_code=status.HTTP_404_NOT_FOUND, details=details)


class ConflictError(FrankError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="conflict", status_code=status.HTTP_409_CONFLICT, details=details)


class UnavailableError(FrankError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="unavailable", status_code=status.HTTP_503_SERVICE_UNAVAILABLE, details=details)


class CapabilityError(FrankError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message=message, code="capability_not_supported", status_code=status.HTTP_400_BAD_REQUEST, details=details)


class ErrorResponse(BaseModel):
    error: str
    code: str
    details: dict[str, Any] = {}


async def frank_error_handler(request: Request, exc: FrankError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=exc.message, code=exc.code, details=exc.details).model_dump(),
    )
