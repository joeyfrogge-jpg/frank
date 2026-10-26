"""Asset management schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AssetResponse(BaseModel):
    asset_id: str
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
    checksum_sha256: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssetListResponse(BaseModel):
    assets: list[AssetResponse]
    total: int
