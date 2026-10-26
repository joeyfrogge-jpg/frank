"""Frank native API server."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.errors import FrankError, frank_error_handler
from api.routes import health, system, videos
from frank_engine import __version__


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Frank API",
        description=(
            "Native REST API for the Frank Independent Video Intelligence "
            "& Generation Ecosystem. FMIE-backed. No third-party generation engines."
        ),
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    app.add_exception_handler(FrankError, frank_error_handler)

    app.include_router(health.router)
    app.include_router(system.router)
    app.include_router(videos.router)

    return app


app = create_app()
