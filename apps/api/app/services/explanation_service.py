"""Patient-level SHAP explanations, computed on demand with pre-built explainers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Sequence

from apps.api.app.core.config import DISCLAIMER
from apps.api.app.core.exceptions import ExplanationError
from apps.api.app.core.logging import get_logger
from apps.api.app.services.model_service import ModelRegistry
from apps.api.app.services.prediction_service import build_feature_frame
from ml.src.explainability.feature_contributions import EXPLANATION_NOTE, patient_contributions
from ml.src.features.feature_schema import TARGET_NAMES


def explain(
    registry: ModelRegistry,
    features: dict[str, Any],
    targets: Sequence[str] | None = None,
    top_k: int | None = None,
) -> dict[str, Any]:
    registry.require_all()
    frame = build_feature_frame(registry, features)
    explanations = {}
    for target in targets or TARGET_NAMES:
        explainer = registry.explainers.get(target)
        if explainer is None:
            raise ExplanationError(f"An explanation for the {target} model is not available.")
        try:
            result = patient_contributions(explainer, frame)
        except Exception as exc:
            get_logger().error("explanation failed for %s: %s", target, type(exc).__name__)
            raise ExplanationError(
                f"The explanation for the {target} model could not be computed. "
                "The prediction itself is unaffected."
            ) from None
        contributions = result["contributions"]
        explanations[target] = {
            "target": target,
            "output_space": result["output_space"],
            "output_space_description": result["output_space_description"],
            "base_value": result["base_value"],
            "raw_score": result["raw_score"],
            "n_features": len(contributions),
            "contributions": contributions[:top_k] if top_k else contributions,
        }
    return {
        "model_version": registry.model_version,
        "timestamp": datetime.now(timezone.utc),
        "explanations": explanations,
        "note": EXPLANATION_NOTE,
        "disclaimer": DISCLAIMER,
    }
