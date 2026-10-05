"""Run the four models on one validated patient."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from apps.api.app.core.config import DISCLAIMER, Settings
from apps.api.app.services.model_service import ModelRegistry
from ml.src.features.feature_engineering import DERIVED_FROM, add_derived_features
from ml.src.features.feature_schema import TARGET_NAMES

_PREDICTED_LABELS = {
    "CAD": ("Model predicts no CAD", "Model predicts CAD"),
    "LAD": ("Model predicts no LAD stenosis", "Model predicts LAD stenosis"),
    "LCX": ("Model predicts no LCX stenosis", "Model predicts LCX stenosis"),
    "RCA": ("Model predicts no RCA stenosis", "Model predicts RCA stenosis"),
}
_CATEGORY_LABELS = {"low": "Low", "moderate": "Moderate", "high": "High", "very_high": "Very high"}


def build_feature_frame(registry: ModelRegistry, features: dict[str, Any]) -> pd.DataFrame:
    """One-row frame of model inputs, with derived features added, in schema order."""
    completed = add_derived_features(features)
    return pd.DataFrame([{name: completed[name] for name in registry.schema.feature_names}])


def range_warnings(registry: ModelRegistry, frame: pd.DataFrame) -> list[dict[str, str]]:
    """Flag numeric inputs outside what the models saw in training (extrapolation)."""
    statistics = registry.development_statistics()
    warnings = []
    for spec in registry.schema.model_features:
        observed = statistics.get(spec.name)
        if spec.kind != "numeric" or not observed:
            continue
        value = float(frame[spec.name].iloc[0])
        if value < observed["min"] or value > observed["max"]:
            warnings.append(
                {
                    "field": spec.name,
                    "message": (
                        f"{spec.label} {value:g} is outside the range seen in training "
                        f"({observed['min']:g}–{observed['max']:g}); the models are extrapolating."
                    ),
                }
            )
    return warnings


def predict_target(registry: ModelRegistry, settings: Settings, target: str, frame: pd.DataFrame) -> dict:
    artifact = registry.artifacts[target]
    model = artifact.model
    probability = float(model.predict_proba(frame)[0])
    predicted = int(probability >= model.threshold)
    category = settings.risk_category(probability)
    result = {
        "target": target,
        "label": artifact.metadata["target_label"],
        "probability": probability,
        "predicted_class": predicted,
        "predicted_label": _PREDICTED_LABELS[target][predicted],
        "decision_threshold": float(model.threshold),
        "risk_category": category,
        "risk_category_label": _CATEGORY_LABELS[category],
        "calibration": artifact.metadata["calibration"]["method"],
    }
    if target != "CAD":
        result["vessel"] = target
    return result


def predict(registry: ModelRegistry, settings: Settings, features: dict[str, Any]) -> dict[str, Any]:
    registry.require_all()
    frame = build_feature_frame(registry, features)
    results = {target: predict_target(registry, settings, target, frame) for target in TARGET_NAMES}
    return {
        "model_version": registry.model_version,
        "timestamp": datetime.now(timezone.utc),
        "cad": results["CAD"],
        "vessels": {name: results[name] for name in ("LAD", "LCX", "RCA")},
        "derived_features": {name: frame[name].iloc[0].item() for name in DERIVED_FROM},
        "warnings": range_warnings(registry, frame),
        "disclaimer": DISCLAIMER,
    }
