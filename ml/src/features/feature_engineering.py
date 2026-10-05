"""Derived model inputs.

Two dataset columns are functions of weight and height: BMI = Weight / (Length/100)^2
and Obesity = 1 exactly when BMI >= 25 (both verified against every record by
ml/tests/test_feature_engineering.py). At inference they are computed here from the
entered weight and height, so they can never disagree with them.
"""

from __future__ import annotations

from typing import Any, Mapping

OBESITY_BMI_THRESHOLD = 25.0
DERIVED_FROM = {"BMI": ("Weight", "Length"), "Obesity": ("Weight", "Length")}


def body_mass_index(weight_kg: float, height_cm: float) -> float:
    return float(weight_kg) / (float(height_cm) / 100.0) ** 2


def obesity_flag(bmi: float) -> int:
    # Rounded so that an exact 25 (e.g. 64 kg at 160 cm) is not lost to floating point.
    return int(round(float(bmi), 9) >= OBESITY_BMI_THRESHOLD)


def add_derived_features(values: Mapping[str, Any]) -> dict[str, Any]:
    """Return ``values`` plus BMI and Obesity computed from Weight and Length."""
    completed = dict(values)
    bmi = body_mass_index(values["Weight"], values["Length"])
    completed["BMI"] = bmi
    completed["Obesity"] = obesity_flag(bmi)
    return completed
