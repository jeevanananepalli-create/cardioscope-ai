"""Model metadata and feature-schema descriptions served to the frontend.

Everything here is read from the trained artifacts or generated reports; no
metric is typed in. File paths, hashes and row indices are left out.
"""

from __future__ import annotations

import json
from typing import Any

from apps.api.app.core.config import DISCLAIMER, RISK_CATEGORY_NOTE, Settings
from apps.api.app.services.model_service import ModelRegistry
from ml.src.data.profile import GROUP_TITLES
from ml.src.features.feature_engineering import DERIVED_FROM
from ml.src.features.feature_schema import TARGET_NAMES
from ml.src.paths import METRICS_DIR

_TRAINING_KEYS = (
    "n_development",
    "n_holdout",
    "development_class_counts",
    "holdout_class_counts",
    "cross_validation",
    "seed",
)


def _target_metadata(registry: ModelRegistry, target: str) -> dict[str, Any]:
    metadata = registry.metadata(target)
    calibration = metadata["calibration"]
    explainer = registry.explainers.get(target)
    return {
        "target": target,
        "label": metadata["target_label"],
        "algorithm": metadata["algorithm"],
        "candidate": metadata["candidate"]["name"],
        "trained_at": metadata["created_at"],
        "decision_threshold": metadata["decision_threshold"],
        "selection_reason": metadata["selection"]["reason"],
        "calibration": {
            "method": calibration["method"],
            "reason": calibration["reason"],
            "threshold_reason": calibration.get("threshold", {}).get("reason"),
            "reliability_curve": calibration.get("reliability_curve"),
        },
        "training": {key: metadata["training"][key] for key in _TRAINING_KEYS},
        "cross_validation": metadata["validation"]["cross_validation"],
        "final_configuration_cross_validation": calibration.get("nested_cv"),
        "holdout": metadata["validation"].get("holdout"),
        "global_importance": metadata.get("global_importance"),
        "explanation_output_space": explainer.output_space if explainer else None,
    }


def _class_distribution() -> dict[str, Any] | None:
    path = METRICS_DIR / "class_distribution.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def model_info(registry: ModelRegistry, settings: Settings) -> dict[str, Any]:
    return {
        "model_version": registry.model_version,
        "models_available": registry.availability,
        "targets": {t: _target_metadata(registry, t) for t in TARGET_NAMES if t in registry.artifacts},
        "class_distribution": _class_distribution(),
        "risk_categories": settings.risk_categories(),
        "risk_category_note": RISK_CATEGORY_NOTE,
        "disclaimer": DISCLAIMER,
    }


def _typical_value(spec, observed: dict[str, Any] | None):
    """Median (numeric) or most frequent level in the development set; None if unknown."""
    if not observed:
        return None
    if spec.kind == "numeric":
        median = observed["median"]
        return int(round(median)) if observed.get("integer_valued") else round(median, 2)
    counts = observed.get("counts", {})
    if not counts:
        return None
    most_frequent = max(counts, key=counts.get)
    for level in [0, 1] if spec.kind == "binary" else spec.categories:
        if str(level) == most_frequent:
            return level
    return None


def feature_schema_description(registry: ModelRegistry) -> dict[str, Any]:
    statistics = registry.development_statistics()
    features = []
    for spec in registry.schema.model_features:
        observed = statistics.get(spec.name)
        features.append(
            {
                "name": spec.name,
                "label": spec.label,
                "group": spec.group,
                "kind": spec.kind,
                "unit": spec.unit,
                "categories": [0, 1] if spec.kind == "binary" else list(spec.categories),
                "input_limits": list(spec.input_limits) if spec.input_limits else None,
                "derived": spec.derived,
                "derived_from": list(DERIVED_FROM.get(spec.name, ())),
                "integer_valued": bool(observed and observed.get("integer_valued", False)),
                "observed": observed,
                "typical_value": _typical_value(spec, observed),
            }
        )
    used_groups = {f["group"] for f in features}
    return {
        "groups": [{"key": k, "title": t} for k, t in GROUP_TITLES.items() if k in used_groups],
        "features": features,
        "excluded_features": [
            {"name": f.name, "label": f.label, "reason": f.exclusion_reason}
            for f in registry.schema.excluded_features
        ],
        "targets": [t.to_dict() for t in registry.schema.targets.values()],
        "observed_on": "development set",
    }
