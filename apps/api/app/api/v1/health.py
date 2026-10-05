from __future__ import annotations

from fastapi import APIRouter, Request

from apps.api.app.schemas.prediction import (
    DemoProfilesResponse,
    FeatureSchemaResponse,
    HealthResponse,
    ModelInfoResponse,
)
from apps.api.app.services import demo_service, metadata_service

router = APIRouter(tags=["service"])


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    registry = request.app.state.registry
    return {
        "status": "ok" if registry.ready else "degraded",
        "models": registry.availability,
        "model_version": registry.model_version,
    }


@router.get("/model-info", response_model=ModelInfoResponse)
def model_info(request: Request):
    """Model descriptions and evaluation results, as produced by the evaluation pipeline."""
    return metadata_service.model_info(request.app.state.registry, request.app.state.settings)


@router.get("/feature-schema", response_model=FeatureSchemaResponse)
def feature_schema(request: Request):
    """The model input features, for building the patient form."""
    return metadata_service.feature_schema_description(request.app.state.registry)


@router.get("/demo-profiles", response_model=DemoProfilesResponse)
def demo_profiles():
    """Synthetic demo inputs. Send one to /predict to see the models' output for it."""
    return demo_service.load_demo_profiles()
