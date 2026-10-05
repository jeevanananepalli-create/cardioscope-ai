"""Response schemas for predictions, model metadata, the feature schema and errors."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

RiskCategoryKey = Literal["low", "moderate", "high", "very_high"]
TargetName = Literal["CAD", "LAD", "LCX", "RCA"]


class TargetPrediction(BaseModel):
    """One model output. A model prediction, not a diagnosis."""

    target: TargetName
    label: str
    probability: float
    predicted_class: Literal[0, 1]
    predicted_label: str
    decision_threshold: float
    risk_category: RiskCategoryKey
    risk_category_label: str
    calibration: str


class VesselPrediction(TargetPrediction):
    """Prediction for one coronary vessel (LAD, LCX or RCA)."""

    vessel: Literal["LAD", "LCX", "RCA"]


class InputWarning(BaseModel):
    field: str
    message: str


class PredictionResponse(BaseModel):
    model_version: str
    timestamp: datetime
    cad: TargetPrediction
    vessels: dict[Literal["LAD", "LCX", "RCA"], VesselPrediction]
    derived_features: dict[str, float | int]
    warnings: list[InputWarning]
    disclaimer: str


class RiskCategory(BaseModel):
    key: RiskCategoryKey
    label: str
    min: float
    max: float


class ModelMetadata(BaseModel):
    """Description and evaluation results of one trained model."""

    target: TargetName
    label: str
    algorithm: str
    candidate: str
    trained_at: str
    decision_threshold: float
    selection_reason: str
    calibration: dict[str, Any]
    training: dict[str, Any]
    cross_validation: dict[str, Any]
    final_configuration_cross_validation: dict[str, Any] | None
    holdout: dict[str, Any] | None
    global_importance: dict[str, Any] | None
    explanation_output_space: str | None


class ModelInfoResponse(BaseModel):
    model_version: str | None
    models_available: dict[TargetName, bool]
    targets: dict[TargetName, ModelMetadata]
    class_distribution: dict[str, Any] | None
    risk_categories: list[RiskCategory]
    risk_category_note: str
    disclaimer: str


class FeatureDescription(BaseModel):
    name: str
    label: str
    group: str
    kind: Literal["numeric", "binary", "ordinal", "categorical"]
    unit: str | None
    categories: list[str | int]
    input_limits: list[float] | None
    derived: bool
    derived_from: list[str]
    integer_valued: bool
    observed: dict[str, Any] | None
    typical_value: float | int | str | None


class FeatureGroup(BaseModel):
    key: str
    title: str


class FeatureSchemaResponse(BaseModel):
    groups: list[FeatureGroup]
    features: list[FeatureDescription]
    excluded_features: list[dict[str, Any]]
    targets: list[dict[str, Any]]
    observed_on: str


class DemoProfile(BaseModel):
    """A synthetic input combination for demonstration. Never a real patient."""

    id: str
    name: str
    summary: str
    synthetic: Literal[True]
    features: dict[str, float | int | str]


class DemoProfilesResponse(BaseModel):
    note: str
    profiles: list[DemoProfile]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    models: dict[TargetName, bool]
    model_version: str | None


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = []


class ApiErrorResponse(BaseModel):
    """Shape of every error response."""

    error: ErrorBody
