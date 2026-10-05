from __future__ import annotations

from fastapi import APIRouter, Request

from apps.api.app.api.v1.predictions import ERROR_RESPONSES
from apps.api.app.schemas.explanation import ExplainRequest, ExplanationResponse
from apps.api.app.schemas.patient import features_to_dict
from apps.api.app.services import explanation_service

router = APIRouter(tags=["explanation"])


@router.post("/explain", response_model=ExplanationResponse, responses=ERROR_RESPONSES)
def explain(payload: ExplainRequest, request: Request):
    """SHAP feature contributions for each model's prediction on this patient."""
    return explanation_service.explain(
        request.app.state.registry,
        features_to_dict(payload.features),
        targets=payload.targets,
        top_k=payload.top_k,
    )
