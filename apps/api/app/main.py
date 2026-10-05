"""CardioScope AI API.

Run from the repository root:
    uvicorn apps.api.app.main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.app.api.v1.router import api_router
from apps.api.app.core.config import API_PREFIX, DISCLAIMER, Settings, get_settings
from apps.api.app.core.exceptions import register_exception_handlers
from apps.api.app.core.logging import configure_logging
from apps.api.app.middleware.request_log import RequestLogMiddleware
from apps.api.app.services.model_service import ModelRegistry


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # A missing model does not stop the API: /health reports it and /predict returns 503.
        app.state.registry = ModelRegistry(settings).load()
        yield

    app = FastAPI(
        title="CardioScope AI API",
        version="0.1.0",
        description=f"Research/educational prototype. {DISCLAIMER}",
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    return app


app = create_app()
