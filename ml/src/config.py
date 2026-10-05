"""Load training configuration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from ml.src.paths import CONFIG_DIR

TRAINING_CONFIG = CONFIG_DIR / "training.yaml"
MODELS_CONFIG = CONFIG_DIR / "models.yaml"


def load_yaml(path: Path | str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_training_config(path: Path | str = TRAINING_CONFIG) -> dict[str, Any]:
    return load_yaml(path)
