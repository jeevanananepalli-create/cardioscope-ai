"""API settings, read from environment variables (see .env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from ml.src.paths import MODELS_DIR

API_PREFIX = "/api/v1"

DISCLAIMER = (
    "This prototype is intended for research, education, and decision-support demonstration "
    "only. It is not a medical device and does not replace professional clinical evaluation, "
    "diagnostic imaging, or physician judgment."
)

RISK_CATEGORY_NOTE = (
    "Risk categories are visualization bands for this prototype. They are not clinically "
    "validated risk thresholds."
)

_CATEGORY_KEYS = ("low", "moderate", "high", "very_high")
_CATEGORY_LABELS = {"low": "Low", "moderate": "Moderate", "high": "High", "very_high": "Very high"}


def _parse_thresholds(raw: str) -> tuple[float, ...]:
    try:
        values = tuple(float(part) for part in raw.split(","))
    except ValueError:
        raise ValueError(
            f"CARDIOSCOPE_RISK_THRESHOLDS must be comma-separated numbers, got {raw!r}"
        ) from None
    increasing = list(values) == sorted(set(values))
    if len(values) != 3 or not increasing or values[0] <= 0 or values[-1] >= 1:
        raise ValueError(
            "CARDIOSCOPE_RISK_THRESHOLDS needs three increasing values between 0 and 1, "
            f"got {raw!r}"
        )
    return values


@dataclass(frozen=True)
class Settings:
    models_dir: Path = MODELS_DIR
    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000")
    # Upper bounds of the low / moderate / high visualization bands.
    risk_thresholds: tuple[float, ...] = (0.25, 0.50, 0.75)
    log_level: str = "INFO"

    def risk_category(self, probability: float) -> str:
        for key, upper in zip(_CATEGORY_KEYS, self.risk_thresholds):
            if probability < upper:
                return key
        return _CATEGORY_KEYS[-1]

    def risk_categories(self) -> list[dict]:
        bounds = (0.0, *self.risk_thresholds, 1.0)
        return [
            {"key": key, "label": _CATEGORY_LABELS[key], "min": bounds[i], "max": bounds[i + 1]}
            for i, key in enumerate(_CATEGORY_KEYS)
        ]


def get_settings() -> Settings:
    defaults = Settings()
    origins = os.environ.get("CARDIOSCOPE_CORS_ORIGINS")
    thresholds = os.environ.get("CARDIOSCOPE_RISK_THRESHOLDS")
    return Settings(
        models_dir=Path(os.environ.get("CARDIOSCOPE_MODELS_DIR", defaults.models_dir)),
        cors_origins=(
            tuple(o.strip() for o in origins.split(",") if o.strip())
            if origins
            else defaults.cors_origins
        ),
        risk_thresholds=_parse_thresholds(thresholds) if thresholds else defaults.risk_thresholds,
        log_level=os.environ.get("CARDIOSCOPE_LOG_LEVEL", defaults.log_level),
    )
