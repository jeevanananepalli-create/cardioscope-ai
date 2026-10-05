"""Request and response schemas for /explain."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from apps.api.app.schemas.patient import PatientFeatures
from apps.api.app.schemas.prediction import TargetName


class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: PatientFeatures  # type: ignore[valid-type]
    targets: list[TargetName] | None = Field(
        default=None, min_length=1, description="Models to explain; all four when omitted."
    )
    top_k: int | None = Field(
        default=None, ge=1, le=100, description="Return only the k largest contributions."
    )


class FeatureContribution(BaseModel):
    feature: str
    label: str
    group: str
    unit: str | None
    value: float | int | str | None
    shap_value: float
    direction: Literal["increases", "decreases", "neutral"]
    description: str


class TargetExplanation(BaseModel):
    target: TargetName
    output_space: Literal["log_odds", "probability"]
    output_space_description: str
    base_value: float
    raw_score: float
    n_features: int
    contributions: list[FeatureContribution]


class ExplanationResponse(BaseModel):
    model_version: str
    timestamp: datetime
    explanations: dict[TargetName, TargetExplanation]
    note: str
    disclaimer: str
