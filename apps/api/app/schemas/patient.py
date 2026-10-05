"""Patient input schema, generated from the dataset feature schema.

Every user-supplied model input becomes a required, strictly typed field whose
JSON name is the dataset column name. Unknown fields are rejected, which also
means LAD, LCX, RCA and Cath can never be submitted as inputs. BMI and Obesity
are derived from weight and height by the service and are not accepted here.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, create_model

from ml.src.features.feature_schema import FeatureSchema, FeatureSpec, load_feature_schema


def _reject_bool(value: Any) -> Any:
    """JSON true/false must not pass as the integers 1/0."""
    if isinstance(value, bool):
        raise ValueError("Must be one of the listed values; true/false is not accepted.")
    return value


def _annotation(spec: FeatureSpec) -> Any:
    if spec.kind == "numeric":
        low, high = spec.input_limits
        return Annotated[float, Field(strict=True, ge=low, le=high, allow_inf_nan=False)]
    levels = (0, 1) if spec.kind == "binary" else tuple(spec.categories)
    return Annotated[Literal[levels], BeforeValidator(_reject_bool)]  # type: ignore[valid-type]


def build_patient_features_model(schema: FeatureSchema) -> type[BaseModel]:
    fields: dict[str, Any] = {}
    for index, spec in enumerate(schema.input_features):
        identifier = f"f{index:02d}_" + re.sub(r"\W+", "_", spec.name).strip("_").lower()
        description = spec.label + (f" ({spec.unit})" if spec.unit else "")
        fields[identifier] = (_annotation(spec), Field(..., alias=spec.name, description=description))
    return create_model(
        "PatientFeatures",
        __config__=ConfigDict(extra="forbid", populate_by_name=False),
        **fields,
    )


PatientFeatures = build_patient_features_model(load_feature_schema())


class PatientInput(BaseModel):
    """Request body for /predict."""

    model_config = ConfigDict(extra="forbid")

    features: PatientFeatures  # type: ignore[valid-type]


def features_to_dict(features: BaseModel) -> dict[str, Any]:
    """Validated features keyed by dataset column name."""
    return features.model_dump(by_alias=True)
