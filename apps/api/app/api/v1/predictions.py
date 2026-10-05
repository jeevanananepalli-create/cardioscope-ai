from __future__ import annotations

from fastapi import APIRouter, Request

from apps.api.app.schemas.patient import PatientInput, features_to_dict
from apps.api.app.schemas.prediction import ApiErrorResponse, PredictionResponse
from apps.api.app.services import prediction_service

router = APIRouter(tags=["prediction"])

ERROR_RESPONSES = {
    422: {"model": ApiErrorResponse, "description": "Invalid or incomplete patient data"},
    503: {"model": ApiErrorResponse, "description": "Models are not available"},
}


@router.post("/predict", response_model=PredictionResponse, responses=ERROR_RESPONSES)
def predict(payload: PatientInput, request: Request):
    """Model predictions for CAD and for LAD, LCX and RCA stenosis."""
    return prediction_service.predict(
        request.app.state.registry, request.app.state.settings, features_to_dict(payload.features)
    )
