"""Turn SHAP results into per-feature contribution records with conservative wording."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from ml.src.explainability.shap_explainer import ModelExplainer

OUTPUT_SPACE_DESCRIPTIONS = {
    "log_odds": "Contributions are in log-odds of the model's raw score.",
    "probability": "Contributions are in probability points of the model's raw score.",
}

EXPLANATION_NOTE = (
    "Feature contributions show how this model used the input values to reach its prediction. "
    "They are not causal, and they do not indicate the presence or location of an anatomical lesion."
)


def describe_contribution(label: str, target: str, shap_value: float) -> str:
    """One-sentence, non-causal description of a contribution."""
    if shap_value == 0:
        return f"{label} did not change the predicted {target} risk for this input."
    direction = "higher" if shap_value > 0 else "lower"
    return f"{label} contributes toward a {direction} predicted {target} risk."


def _display_value(spec, raw_value) -> Any:
    try:
        value = spec.canonical(raw_value)
    except ValueError:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def patient_contributions(explainer: ModelExplainer, features: pd.DataFrame) -> dict[str, Any]:
    """Contributions for a single patient row, largest absolute contribution first."""
    if len(features) != 1:
        raise ValueError("patient_contributions expects exactly one row.")
    result = explainer.explain(features)
    target = explainer.model.target
    row = features.iloc[0]
    contributions = []
    for name, value in zip(result.feature_names, result.values[0]):
        spec = explainer.schema.get(name)
        shap_value = float(value)
        contributions.append(
            {
                "feature": name,
                "label": spec.label,
                "group": spec.group,
                "unit": spec.unit,
                "value": _display_value(spec, row[name]),
                "shap_value": shap_value,
                "direction": "increases" if shap_value > 0 else "decreases" if shap_value < 0 else "neutral",
                "description": describe_contribution(spec.label, target, shap_value),
            }
        )
    contributions.sort(key=lambda item: abs(item["shap_value"]), reverse=True)
    return {
        "target": target,
        "output_space": result.output_space,
        "output_space_description": OUTPUT_SPACE_DESCRIPTIONS[result.output_space],
        "base_value": result.base_value,
        "raw_score": float(result.raw_score()[0]),
        "explains_calibrated_probability": explainer.model.calibrator is None
        and result.output_space == "probability",
        "note": EXPLANATION_NOTE,
        "contributions": contributions,
    }


def global_importance(explainer: ModelExplainer, features: pd.DataFrame) -> dict[str, Any]:
    """Mean absolute SHAP value per feature over ``features``, most important first."""
    result = explainer.explain(features)
    mean_abs = np.abs(result.values).mean(axis=0)
    mean_signed = result.values.mean(axis=0)
    ranked = sorted(
        (
            {
                "feature": name,
                "label": explainer.schema.get(name).label,
                "group": explainer.schema.get(name).group,
                "mean_abs_shap": float(mean_abs[index]),
                "mean_shap": float(mean_signed[index]),
            }
            for index, name in enumerate(result.feature_names)
        ),
        key=lambda item: item["mean_abs_shap"],
        reverse=True,
    )
    return {
        "target": explainer.model.target,
        "output_space": result.output_space,
        "n_rows": int(len(features)),
        "computed_on": "development set",
        "features": ranked,
    }
