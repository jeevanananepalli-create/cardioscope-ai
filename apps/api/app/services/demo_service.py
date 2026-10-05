"""Synthetic demo profiles for first-time users and reviewers.

The profiles in ``app/data/demo_profiles.json`` are input combinations chosen by the
developers. They are not real patients and not records from the dataset. Their
predictions are computed by the trained models when requested, like any other input.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from apps.api.app.core.logging import get_logger
from apps.api.app.schemas.patient import PatientFeatures, features_to_dict

DEMO_PROFILES_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_profiles.json"


@lru_cache(maxsize=1)
def load_demo_profiles() -> dict[str, Any]:
    """Demo profiles that pass the same validation as user input; invalid ones are dropped."""
    raw = json.loads(DEMO_PROFILES_PATH.read_text(encoding="utf-8"))
    profiles = []
    for profile in raw["profiles"]:
        try:
            features = features_to_dict(PatientFeatures.model_validate(profile["features"]))
        except ValidationError:
            get_logger().error("demo profile %s does not match the feature schema; skipped", profile.get("id"))
            continue
        profiles.append(
            {
                "id": profile["id"],
                "name": profile["name"],
                "summary": profile["summary"],
                "synthetic": True,
                "features": features,
            }
        )
    return {"note": raw["note"], "profiles": profiles}
